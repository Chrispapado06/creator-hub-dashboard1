/**
 * Facts about each mountain, from Wikidata and Wikipedia.
 *
 * NONE OF THIS IS ICEFALL'S. Coordinates and topographic prominence come from
 * the peak's Wikidata item; the first-ascent line and the description are read
 * off its English Wikipedia article. They are here because a mountain page that
 * invented a first ascent or a prominence figure would be worse than useless —
 * these are checkable claims about real places, and getting one wrong is a
 * different order of error from a mocked-up price.
 *
 * ATTRIBUTION IS REQUIRED AND RENDERED. Wikipedia text is CC BY-SA 4.0, so
 * every description on the page carries a link to the article it came from.
 * Dropping that link would be a licence breach, not a tidy-up.
 *
 * Regenerate with scratchpad/peakfacts.mjs + firstascent2.mjs.
 */

export interface PeakFacts {
  lat: number | null;
  lon: number | null;
  /** Metres. Absent where Wikidata has none. */
  prominenceM: number | null;
  /** As Wikipedia's infobox states it — date, then who. Null where unrecorded. */
  firstAscent: string | null;
  /** The article's opening paragraphs. CC BY-SA 4.0 — see `wikipedia`. */
  about: string[];
  wikipedia: string;
}

export const PEAK_FACTS: Record<string, PeakFacts> = {
  "everest": {
    lat: 27.98806,
    lon: 86.925,
    prominenceM: 8849,
    firstAscent: "29 May 1953 · Edmund Hillary and Tenzing Norgay",
    about: ["Mount Everest (known locally as Sagarmāthā in Nepal and Qomolangma in the Tibet Autonomous Region of China) is the highest mountain on Earth above sea level. It lies in the Mahalangur Himal sub-range of the Himalayas and marks part of the China–Nepal border at its summit. Its height was most recently measured in 2020 through a joint survey by Nepalese and Chinese authorities as 8,848.86 m (29,031 ft 8+1⁄2 in).", "Mount Everest attracts many climbers, including highly experienced mountaineers. There are two main climbing routes, one approaching the summit from the southeast in Nepal (known as the standard route) and the other from the north in China. While not posing substantial technical climbing challenges on the standard route, Everest presents dangers such as altitude sickness, weather, and wind, as well as hazards from avalanches and the Khumbu Icefall. As of May 2024, 340 people have died on Everest. Over 200 bodies remain on the mountain and have not been removed due to the dangerous conditions."],
    wikipedia: "https://en.wikipedia.org/wiki/Mount_Everest",
  },
  "k2": {
    lat: 35.88111,
    lon: 76.51333,
    prominenceM: 4020,
    firstAscent: "31 July 1954 · Achille Compagnoni Lino Lacedelli",
    about: ["K2, also known as Mount Godwin-Austen, at 8,611 metres (28,251 ft) above sea level, is the second-highest mountain on Earth, after Mount Everest at 8,849 metres (29,032 ft). It lies in the Karakoram range, partially in the Gilgit-Baltistan region of Pakistan-administered Kashmir and partially in the China-administered Trans-Karakoram Tract in the Taxkorgan Tajik Autonomous County of Xinjiang.", "K2 became known as the Savage Mountain after George Bell—a climber on the 1953 American expedition—said, \"It's a savage mountain that tries to kill you.\" Of the five highest mountains in the world, K2 has long been the deadliest: prior to 2021, approximately one person had died on the mountain for every four who reached the summit. After an increase in successful attempts, as of August 2023, an estimated 800 people have summited K2, with 96 deaths during attempted climbs."],
    wikipedia: "https://en.wikipedia.org/wiki/K2",
  },
  "kangchenjunga": {
    lat: 27.703,
    lon: 88.14735,
    prominenceM: 3922,
    firstAscent: "25 May 1955 by Joe Brown and George Band on the 1955 British Kangchenjunga expedition",
    about: ["Kangchenjunga (Nepali: कञ्चनजङ्गा, romanized: Kañcanajaṅgā, Sherpa: གངས་ཆེན་མཛོད་ལྔ ; Wylie: Gangs Chen mdzod lnga ) is the third-highest mountain in the world. Its summit lies at 8,586 m (28,169 ft) in a section of the Himalayas, the Kangchenjunga Himal, which is bounded in the west by the Tamur River, in the north by the Lhonak River and Jongsang La, and in the east by the Teesta River. It lies in the border region between Koshi Province of Nepal and Sikkim state of India, with the West and Kangbachen peaks located in Nepal's Taplejung District and the Main, Central and South peaks directly on the border.", "Until 1852, Kangchenjunga was assumed to be the highest mountain in the world. However, precise calculations and meticulous measurements by the Great Trigonometrical Survey of India in 1849 showed that Mount Everest, known as Peak XV at the time, is higher. After allowing for further verification of all calculations, it was officially announced in 1856 that Kangchenjunga is the third-highest mountain in the world."],
    wikipedia: "https://en.wikipedia.org/wiki/Kangchenjunga",
  },
  "lhotse": {
    lat: 27.96167,
    lon: 86.93333,
    prominenceM: 610,
    firstAscent: "18 May 1956 · Fritz Luchsinger, Ernst Reiss",
    about: ["Lhotse (Nepali: ल्होत्से, romanized: L'hōtsē [lotse]; Standard Tibetan: ལྷོ་རྩེ, romanized: lho tse, lit. 'South Peak' [l̥otse]; Chinese: 洛子峰) is the fourth-highest mountain on Earth, after Mount Everest, K2, and Kangchenjunga. At an elevation of 8,516 metres (27,940 ft) above sea level, the main summit is on the border between the Tibet Autonomous Region of China and the Khumbu region of Nepal.", "With Everest to the north and Nuptse to the west, Lhotse forms the apex of the massive horseshoe-shaped arc of the Everest massif. Despite the tremendous vertical relief of its South and Northeast Faces, it is the least prominent of the eight-thousanders due to the great height of the South Col between it and Everest. Lhotse's Western Face, recessed behind the head of the Khumbu Glacier in the Western Cwm, plays an integral part in the standard routes of ascent for both peaks. The name Lhotse, which means \"South Peak\" in Tibetan, further emphasizes the close relationship between the two."],
    wikipedia: "https://en.wikipedia.org/wiki/Lhotse",
  },
  "makalu": {
    lat: 27.88917,
    lon: 87.08861,
    prominenceM: 2378,
    firstAscent: "May 15, 1955, by Lionel Terray and Jean Couzy",
    about: ["Makalu (Nepali: मकालु हिमाल, romanized: Makālu himāl; Chinese: 马卡鲁峰; pinyin: Mǎkǎlǔ Fēng) is the fifth-highest mountain on Earth, with a summit at an elevation of 8,485 metres (27,838 ft) AMSL. It is located in the Mahalangur Himalayas 19 km (12 mi) southeast of Mount Everest, on the China–Nepal border. One of the eight-thousanders, Makalu is an isolated peak shaped like a four-sided pyramid.", "Makalu has two notable subsidiary peaks. Kangchungtse, or Makalu II (7,678 m (25,190 ft)), lies about three kilometres (two miles) north-northwest of the main summit. Rising about 5 km (3 mi) north-northeast of the main summit across a broad plateau, and connected to Kangchungtse by a narrow, 7,200 m (23,600 ft) saddle, is Chomo Lonzo (7,804 m (25,604 ft))."],
    wikipedia: "https://en.wikipedia.org/wiki/Makalu",
  },
  "cho-oyu": {
    lat: 28.09417,
    lon: 86.66083,
    prominenceM: 2344,
    firstAscent: "October 19, 1954 by Herbert Tichy, Joseph Jöchler de , Pasang Dawa Lama",
    about: ["Cho Oyu (Nepali: चोयु; Tibetan: ཇོ་བོ་དབུ་ཡ; Chinese: 卓奥友峰) is the sixth-highest mountain in the world at 8,188 metres (26,864 ft) above sea level. Cho Oyu means 'Turquoise Goddess' in Tibetan.  The mountain is the westernmost major peak of the Khumbu sub-section of the Mahalangur Himalaya 20 km (12 mi) west of Mount Everest. The mountain stands on the China–Nepal border, between the Tibet Autonomous Region and Koshi Province.", "Just a few kilometres west of Cho Oyu is Nangpa La (5,716 m or 18,753 ft), a glaciated pass that serves as the main trading route between the Tibetans and the Khumbu's Sherpas. This pass separates the Khumbu and Rolwaling Himalayas. Due to its proximity to this pass and the generally moderate slopes of the standard northwest ridge route, Cho Oyu is considered the easiest 8,000 metre peak to climb. It is a popular objective for professionally guided parties."],
    wikipedia: "https://en.wikipedia.org/wiki/Cho_Oyu",
  },
  "dhaulagiri": {
    lat: 28.69667,
    lon: 83.49,
    prominenceM: 3357,
    firstAscent: "13 May 1960 by Kurt Diemberger, A. Schelbert, E. Forrer, Nawang Dorje, Nyima Dorje",
    about: ["Dhaulagiri, located in Nepal, is the seventh highest mountain in the world at 8,167 metres (26,795 ft) above sea level, and the highest mountain within the borders of a single country.  Dhaulagiri I is also the highest point of the Gandaki river basin. It was first climbed on 13 May 1960 by a Swiss-Austrian-Nepali expedition.", "Annapurna I (8,091 m (26,545 ft)) is 34 km (21 mi) east of Dhaulagiri. The Kali Gandaki River flows between the two in the Kali Gandaki Gorge, the world's deepest. The town of Pokhara is south of the Annapurnas, an important regional center and the gateway for climbers and trekkers visiting both ranges as well as a tourist destination in its own right."],
    wikipedia: "https://en.wikipedia.org/wiki/Dhaulagiri",
  },
  "manaslu": {
    lat: 28.55,
    lon: 84.55972,
    prominenceM: 3092,
    firstAscent: "May 9, 1956, by a Japanese team",
    about: ["Manaslu (; Nepali: मनास्लु, also known as Kutang) is the eighth-highest mountain in the world at 8,163 metres (26,781 ft) above sea level. It is in the Mansiri Himal, part of the Nepalese Himalayas, in  west-central Nepal. Manaslu means \"mountain of the spirit\" and the word is derived from the Sanskrit word manasa, meaning \"intellect\" or \"soul\". Manaslu was first climbed on May 9, 1956, by Toshio Imanishi and Gyalzen Norbu, members of a Japanese expedition.", "Manaslu is the highest peak in the Gorkha District and is about 64 km (40 mi) east of Annapurna, the tenth highest mountain in the world at 8,091 metres (26,545 ft) above sea level. Manaslu's long ridges and valley glaciers offer feasible approaches from all directions and culminate in a peak that towers steeply above its surrounding landscape and is a dominant feature when viewed from afar."],
    wikipedia: "https://en.wikipedia.org/wiki/Manaslu",
  },
  "nanga-parbat": {
    lat: 35.23917,
    lon: 74.59,
    prominenceM: 4608,
    firstAscent: "3 July 1953 by Hermann Buhl on 1953 German–Austrian Nanga Parbat expedition · First winter ascent: 16 February 2016 by Ali Sadpara, Simone M",
    about: ["Nanga Parbat, known in Shina as Diamer, is the ninth-highest mountain on Earth with its summit at 8,126 m (26,660 ft) above sea level. Lying immediately southeast of the northernmost bend of the Indus River in the Gilgit-Baltistan region of Pakistan-administered Kashmir, Nanga Parbat is the westernmost major peak of the Himalayas, and thus in the traditional view of the Himalayas as bounded by the Indus and Yarlung Tsangpo/Brahmaputra rivers, it is the western anchor of the entire mountain range.", "Nanga Parbat is one of the 14 eight-thousanders. It rises far above its surrounding terrain and has the second-highest prominence among the 100 tallest mountains on Earth only behind Mount Everest. Nanga Parbat is well-known for being an extremely difficult climb, and has earned the nickname Killer Mountain for its high number of climber fatalities and pushing climbers to their limits. According to Guinness World Records, Nanga Parbat is the fastest growing mountain in the world, growing taller at a rate of 7 mm (0.27 in) per year."],
    wikipedia: "https://en.wikipedia.org/wiki/Nanga_Parbat",
  },
  "annapurna": {
    lat: 28.5958,
    lon: 83.82,
    prominenceM: 2984,
    firstAscent: "3 June 1950 · Maurice Herzog and Louis Lachenal",
    about: ["Annapurna (; Nepali: अन्नपूर्ण) is a mountain situated in the Annapurna mountain range of Gandaki Province, north-central Nepal. It is the 10th highest mountain in the world at 8,091 metres (26,545 ft) above sea level and is well known for the difficulty and danger involved in its ascent.", "Maurice Herzog led a French expedition to its summit through the north face in 1950, making it the first eight-thousander to be successfully climbed. The entire massif and surrounding area are protected within the 7,629-square-kilometre (2,946 mi2) Annapurna Conservation Area, the first and largest conservation area in Nepal. The Annapurna Conservation Area is home to several world-class treks, including Annapurna Sanctuary and Annapurna Circuit."],
    wikipedia: "https://en.wikipedia.org/wiki/Annapurna_I",
  },
  "gasherbrum-i": {
    lat: 35.72444,
    lon: 76.69639,
    prominenceM: 2155,
    firstAscent: "5 July 1958 by an American team including two Pakistan army officers · First winter ascent 9 March 2012 Adam Bielecki and Janusz Gołąb pl",
    about: ["Gasherbrum I, originally surveyed as K5, and also known as Hidden Peak, is the 11th highest mountain in the world at 8,080 metres (26,510 ft) above sea level. It is located between Shigar District in the Gilgit–Baltistan region of Pakistan and Tashkurgan in the Xinjiang province of China. Gasherbrum I is part of the Gasherbrum Massif, located in the Karakoram range. ", "Gasherbrum is often claimed to mean \"Shining Wall\", presumably a reference to the highly visible face of the neighboring peak Gasherbrum IV; but in fact, it comes from \"rgasha\" (beautiful) + \"brum\" (mountain) in Balti, hence it actually means \"beautiful mountain\"."],
    wikipedia: "https://en.wikipedia.org/wiki/Gasherbrum_I",
  },
  "broad-peak": {
    lat: 35.81056,
    lon: 76.56806,
    prominenceM: 1701,
    firstAscent: "9 June 1957, by an Austrian team",
    about: ["Broad Peak is the 12th highest mountain in the world at 8,051 metres (26,414 ft) elevation above sea level. It is one of the eight-thousanders, and is located in the Karakoram range spanning Gilgit-Baltistan, Pakistan, and Xinjiang, China. The first ascent of this mountain was in June 1957, accomplished by Fritz Wintersteller, Marcus Schmuck, Kurt Diemberger, and Hermann Buhl as part of an Austrian expedition."],
    wikipedia: "https://en.wikipedia.org/wiki/Broad_Peak",
  },
  "gasherbrum-ii": {
    lat: 35.7575,
    lon: 76.65278,
    prominenceM: 1524,
    firstAscent: "July 7, 1956, by Fritz Moravec, Josef Larch and Hans Willenpart",
    about: ["Gasherbrum II, originally surveyed as K4, is the 13th highest mountain in the world at 8,035 metres (26,362 ft) above sea level. It is the third-highest peak of the Gasherbrum massif, and is located in the Karakoram, on the border between Gilgit–Baltistan, Pakistan and Xinjiang, China. The mountain was first climbed on July 7, 1956, by an Austrian expedition which included Fritz Moravec, Josef Larch, and Hans Willenpart."],
    wikipedia: "https://en.wikipedia.org/wiki/Gasherbrum_II",
  },
  "shishapangma": {
    lat: 28.35222,
    lon: 85.77972,
    prominenceM: 2897,
    firstAscent: "2 May 1964 by Chinese team: · Xu Jing · Zhang Junyan · Wang Fuzhou · Wu Zongyue · Chen San · Soinam Dorjê · Cheng Tianliang · Migmar Zhaxi",
    about: ["Shishapangma, or Shishasbangma or Xixiabangma (Chinese: 希夏邦马; pinyin: Xī xià bāng mǎ), is the 14th-highest mountain in the world, at 8,027 metres (26,335 ft) above sea level. The lowest 8,000 metre peak, it is located entirely within Tibet."],
    wikipedia: "https://en.wikipedia.org/wiki/Shishapangma",
  },
  "muztagh-tower": {
    lat: 35.82833,
    lon: 76.36083,
    prominenceM: 1707,
    firstAscent: "6 July 1956 by a British team",
    about: ["Muztagh Tower (Urdu: مز تاغ ٹاور), also Mustagh Tower; Muztagh: icy mountain), is a mountain situated in Baltoro Muztagh, which is a segment of the Karakoram range. It straddles the border of the Gilgit–Baltistan region of Pakistan and the Xinjiang Uyghur Autonomous Region of China. Muztagh Tower is located between the basins of the Baltoro and Sarpo Laggo glaciers."],
    wikipedia: "https://en.wikipedia.org/wiki/Muztagh_Tower",
  },
  "lenin-peak": {
    lat: 39.34368,
    lon: 72.8779,
    prominenceM: 2853,
    firstAscent: "1928 by Karl Wien, Eugen Allwein and Erwin Schneider",
    about: ["Lenin Peak or Ibn Sina (Avicenna) Peak is a mountain in the Trans-Alay Range of the Pamir Mountains, in the Gorno-Badakhshan and Osh regions on the Kyrgyzstan–Tajikistan border. At 7,134 metres (23,406 ft), it is the second-highest point of both countries (after Ismoil Somoni Peak in Tajikistan and Jengish Chokusu in Kyrgyzstan) and the tallest mountain of the Trans-Alay Range. It is considered one of the least technical 7,000 m peaks in the world to climb and has the most ascents of any peak over 7,000 metres, with hundreds of climbers attempting it annually.", "Lenin Peak was thought to be the highest point in the Pamirs in Tajikistan until 1933, when Ismoil Somoni Peak (known as Stalin Peak at the time) was climbed and found to be more than 300 metres higher. Two mountains in the Pamirs in China, Kongur Tagh (7,649 m) and Muztagh Ata (7,546 m), are higher than the Tajik summits."],
    wikipedia: "https://en.wikipedia.org/wiki/Lenin_Peak",
  },
  "baruntse": {
    lat: 27.88333,
    lon: 86.98333,
    prominenceM: 979,
    firstAscent: "1954 by New Zealand expedition",
    about: ["Baruntse is a mountain in the Khumbu region of eastern Nepal, crowned by four peaks and bounded on the south by the Hunku Glacier, on the east by the Barun Glacier, and on the northwest by the Imja Glacier. It is considered as one of the best preparation peaks in the Himalayas for climbers readying themselves for eight-thousanders, however the mountain has a low success rate due to its technical difficulties, steep slopes and unpredictable weather conditions. It is open for beginners, but requires the use of fixed ropes to climb.", "The mountain is usually accessed from the South, where climbers can ascend Mera Peak to acclimatize before moving up the valley to the Baruntse base camp. From the village of Lukla, it is an eight-day hike to the base camp."],
    wikipedia: "https://en.wikipedia.org/wiki/Baruntse",
  },
  "himlung-himal": {
    lat: 28.735,
    lon: 84.41667,
    prominenceM: 2005,
    firstAscent: "1983 by Nepal and Hirosaki University HIMLUNG HIMAL Joint Expedition Wataru Saito, Makito Minami, Ken Takahashi (Japanese), Kirkin Lama (Nep",
    about: ["Nemjung or Nimjung is a mountain in the Himalayas of Nepal. It is located approximately 150 kilometres (93 mi) northwest of the Nepalese capital Kathmandu and about 25 km (16 mi) northwest of the eight-thousander, Manaslu. Its summit has an elevation of 7,140 metres (23,425 ft). This mountain was once called Himlung Himal.", "In the 1990s, a few years after the first ascent in 1983, when demarcating the border with China, the Nepalese government changed the traditional name of Himlung Himal to another mountain about 4 kilometres north. The peak between them is properly called Himjung. It is the highest among the three peaks of Nemjung (east), Himjung (centre) and Himlung Himal range (west)."],
    wikipedia: "https://en.wikipedia.org/wiki/Himlung_Himal",
  },
  "khan-tengri": {
    lat: 42.21083,
    lon: 80.175,
    prominenceM: 1685,
    firstAscent: "1931 Mikhail Pogrebetsky",
    about: ["Khan Tengri is a mountain of the Tian Shan mountain range in Central Asia. It is on the China—Kyrgyzstan—Kazakhstan tripoint, east of lake Issyk Kul in Kyrgyzstan. Its geologic elevation is 6,995 m (22,949 ft), but its glacial icecap rises to 7,010 m (22,999 ft). For this reason, in mountaineering circles, including for the Snow Leopard award criteria, it is considered a 7,000-metre peak.", "Khan Tengri is the second-highest mountain in the Tian Shan, surpassed only by Jengish Chokusu (meaning 'Victory Peak' in the Kyrgyz language, formerly known as Peak Pobeda) (7,439 m). Khan Tengri is the highest point in Kazakhstan and third-highest peak in Kyrgyzstan, after Jengish Chokusu (7,439 m) and Avicenna Peak (7,134 m). It is also the world's most northern 7,000-metre peak, notable because peaks of high latitude have a shorter climbing season and generally more severe weather."],
    wikipedia: "https://en.wikipedia.org/wiki/Khan_Tengri",
  },
  "ama-dablam": {
    lat: 27.86111,
    lon: 86.86139,
    prominenceM: 1027,
    firstAscent: "1961",
    about: ["Ama Dablam is a mountain in the Eastern Himalayas range of Koshi Province, Nepal. The main peak is 6,812 metres (22,349 ft), the lower western peak is 6,170 metres (20,243 ft). The name Ama Dablam literally means 'mother's charm box' in the Sherpa language; the long ridges on each side like the arms of a mother (ama) protecting her child, and the hanging glacier thought of as the dablam, the traditional double-pendant containing pictures of the gods, worn by Sherpa women. For several days, Ama Dablam dominates the eastern sky for anyone trekking to Mount Everest Base Camp. Because of its soaring ridges and steep faces, Ama Dablam is sometimes referred as the \"Matterhorn of the Himalayas\". The mountain is featured on the one rupee Nepalese banknote.", "Alfred Gregory led the first attempt to climb Ama Dablam in 1958. The first successful ascent was made on 13 March 1961, when Mike Gill (NZ), Barry Bishop (US), Mike Ward (UK) and Wally Romanes (NZ) climbed the Southwest Ridge.  They were well-acclimatised to altitude, having wintered over at 5,800 metres (19,029 ft) near the base of the peak as part of the 1960–61 Silver Hut expedition, led by Sir Edmund Hillary."],
    wikipedia: "https://en.wikipedia.org/wiki/Ama_Dablam",
  },
  "kailash": {
    lat: 31.06694,
    lon: 81.31278,
    prominenceM: 1319,
    firstAscent: "Unclimbed (prohibited)",
    about: ["Mount Kailash is a mountain in Ngari Prefecture, Tibet Autonomous Region of China. It lies in the Gangdise Shan mountain range of the Transhimalaya, in the western part of the Tibetan Plateau. The peak of Mount Kailash is located at an elevation of 6,638 m (21,778 ft), near the western trijunction of China, India, and Nepal.", "Mount Kailash is located close to Manasarovar and Rakshastal lakes. The sources of four rivers–Indus, Sutlej, Brahmaputra, and Ghaghara–lie in the vicinity of the region. The mountain is considered sacred in Bon, Buddhism, Hinduism, and Jainism. Several people undertake a pilgrimage to the mountain, which generally involves trekking towards Lake Manasarovar and a circumambulation of the mountain."],
    wikipedia: "https://en.wikipedia.org/wiki/Mount_Kailash",
  },
  "mera-peak": {
    lat: 27.7,
    lon: 86.86667,
    prominenceM: 1061,
    firstAscent: "Mera Central: May 20, 1953 by Col J.O.M. Roberts and Sen Tenzing; Mera North: 1975 by Marcel Jolly, G. Baus and L. Honills",
    about: ["Mera Peak is a mountain in the Mahalangur section, Barun sub-section of the Himalaya and administratively in Nepal's Sagarmatha Zone, Sankhuwasabha. At 6,476 metres (21,247 ft) it is classified as a trekking peak. It contains three main summits: Mera North, 6,476 metres (21,247 ft); Mera Central, 6,461 metres (21,198 ft); and Mera South, 6,065 metres (19,898 ft), as well as a smaller \"trekking summit\", visible as a distinct summit from the south but not marked on most maps of the region.", "The height of Mera is often given as 6,654 metres (21,831 ft), and claimed to be the highest trekking peak. This figure actually points to nearby Peak 41, which was mistakenly named Mera in a list of Himalayan peaks, and the figures were copied to the official trekking peak list as they were, including the wrong location coordinates."],
    wikipedia: "https://en.wikipedia.org/wiki/Mera_Peak",
  },
  "island-peak": {
    lat: 27.91667,
    lon: 86.93333,
    prominenceM: 475,
    firstAscent: "1956 by Hans-Rudolf Von Gunten and 2 unknown Sherpas",
    about: ["Island Peak (Nepali: इम्जा छे, Imja Tse) is a mountain in Sagarmatha National Park in the Himalayas of eastern Nepal. The peak was named Island Peak in 1953 by members of the British Mount Everest expedition because it appears as an island in a sea of ice when viewed from Dingboche. The peak was later renamed in 1983 to Imja Tse but Island Peak remains the popular choice. The peak is actually an extension of the ridge coming down off the south end of Lhotse Shar.", "The southwest summit of Imja Tse was first climbed in 1953 as part of a training exercise by a British expedition that went on to summit Mount Everest. The team that climbed Imja Tse comprised Tenzing Norgay, Charles Evans, Alfred Gregory, Charles Wylie and seven other Sherpas. The main summit was first climbed in 1956 by Hans-Rudolf Von Gunten and two unknown Sherpas, members of a Swiss team that went on to make the second ascent of Everest and the first ascent of Lhotse."],
    wikipedia: "https://en.wikipedia.org/wiki/Imja_Tse",
  },
  "lobuche-east": {
    lat: 27.9595,
    lon: 86.78994,
    prominenceM: 275,
    firstAscent: "April 25, 1984",
    about: ["Lobuche (also spelt Lobuje) is a Nepalese mountain which lies close to the Khumbu Glacier and the settlement of Lobuche. There are two main peaks, Lobuche East and Lobuche West. A permit to climb the mountain is required from the Nepal Mountaineering Association (NMA), which classifies Lobuche East (6,119m) as a \"trekking peak\" and Lobuche West (6,145m) as an \"expedition peak\". The permit is issued by Nepal Mountaineering Association and costs US$350 during spring, US$175 during autumn, and US$175 during winter/summer. The easier, trekking peak, the East peak is climbed far more frequently than the West peak; however, most of those climbers only do so to reach a false summit that is still a few hours from the true summit of Lobuche East. Between the two peaks is a long, deeply notched ridge, with a steep drop and its considerable distance making an approach of the West peak from the East practically impossible.", "The first recorded ascent of Lobuche East was made by Laurence Nielson and Sherpa Ang Gyalzen on April 25, 1984."],
    wikipedia: "https://en.wikipedia.org/wiki/Lobuche",
  },
  "aconcagua": {
    lat: -32.65306,
    lon: -70.01167,
    prominenceM: 6962,
    firstAscent: "1897 · Matthias Zurbriggen (first recorded ascent)",
    about: ["Aconcagua (Spanish pronunciation: [akoŋˈkaɣwa]) is a mountain in the Principal Cordillera of the Andes range, located in Mendoza Province, Argentina. With a summit elevation of 6,967.15 metres (22,858.1 feet), it is the highest mountain in the Americas, the highest outside Asia, and the highest peak in both the Western and Southern Hemispheres. It is the second-most topographically prominent peak in the world and one of the Seven Summits, the highest mountains on each of the seven continents.", "The mountain lies 112 kilometres (70 mi) northwest of Mendoza, approximately 15 kilometres (9.3 mi) from the Argentine–Chilean border. It is bounded by the Vacas Valley to the north and east and the Horcones Inferior Valley to the west and south, and is protected within Aconcagua Provincial Park. Several glaciers descend its flanks, the largest being the Horcones Inferior glacier (Ventisquero Horcones Inferior), at roughly 10 kilometres (6.2 mi) long."],
    wikipedia: "https://en.wikipedia.org/wiki/Aconcagua",
  },
  "ojos-del-salado": {
    lat: -27.10972,
    lon: -68.54139,
    prominenceM: 3688,
    firstAscent: "February 26, 1937, by Jan Alfred Szczepański and Justyn Wojsznis pl",
    about: ["Nevado Ojos del Salado (Spanish pronunciation: [ˈoxos ðel saˈlaðo] ) is a dormant complex volcano in the Andes on the Argentina–Chile border. It is the highest volcano on Earth and the highest peak in Chile. The upper reaches of Ojos del Salado consist of several overlapping lava domes, lava flows and volcanic craters, with sparse ice cover. The complex extends over an area of 70–160 square kilometres (27–62 mi2) and its highest summit reaches an altitude of 6,893 metres (22,615 ft) above sea level. Numerous other volcanoes rise around Ojos del Salado.", "Being close to the Arid Diagonal of South America, the mountain has extremely dry conditions, which prevent the formation of substantial glaciers and a permanent snow cover. Despite the arid climate, there is a permanent crater lake about 100 m (330 ft) in diameter at an elevation of 6,480–6,500 metres (21,260–21,330 ft) within the summit crater and east of the main summit. This is the highest lake of any kind in the world. Owing to its altitude and the desiccated climate, the mountain lacks vegetation."],
    wikipedia: "https://en.wikipedia.org/wiki/Ojos_del_Salado",
  },
  "huascaran": {
    lat: -9.11667,
    lon: -77.6,
    prominenceM: 2776,
    firstAscent: "Huascarán Sur: 20 July 1932 · Huascarán Norte: 2 September 1908",
    about: ["Huascarán (Spanish pronunciation: [waskaˈɾan], wass-ka-RAHN; Quechua: Waskaran), Nevado Huascarán or Mataraju is a mountain located in Yungay Province, Ancash Department, Peru. It is situated in the Cordillera Blanca range of the western Andes. The southern summit of Huascarán (Huascarán Sur), which reaches 6,768 metres (22,205 ft), is the highest point in Peru, the northern Andes (north of Lake Titicaca), and in all of the Earth's tropics. It is the fourth highest mountain in South America after Aconcagua, Ojos del Salado, and Monte Pissis. Huascarán is ranked 25th by topographic isolation."],
    wikipedia: "https://en.wikipedia.org/wiki/Huascar%C3%A1n",
  },
  "chimborazo": {
    lat: -1.46917,
    lon: -78.8175,
    prominenceM: 4122,
    firstAscent: null,
    about: ["Chimborazo (Spanish: [tʃimboˈɾaso] ) is a stratovolcano in Ecuador and the Cordillera Occidental range of the Andes. Its last known eruption is believed to have occurred around AD 550.", "Chimborazo is the highest mountain in Ecuador and the 39th-highest peak in the entire Andes. Although not the tallest mountain on Earth relative to sea level—it reaches a height of 6,263 m (20,548 ft), well below that of Mount Everest at 8,849 m (29,032 ft)—its summit is the farthest point on Earth's surface from its center due to its location along the equatorial bulge."],
    wikipedia: "https://en.wikipedia.org/wiki/Chimborazo",
  },
  "denali": {
    lat: 63.06917,
    lon: -151.00639,
    prominenceM: 6155,
    firstAscent: "June 7, 1913 by Hudson Stuck · Harry Karstens · Walter Harper · Robert Tatum",
    about: ["Denali ( də-NAH-lee; Koyukon: Deenaalee), federally designated as Mount McKinley, is the highest mountain peak in North America, with a summit elevation of 20,310 feet (6,190 m) above sea level. Its vertical relief above the surrounding plateaus is one of the greatest on Earth, measuring about 18,000 feet (5,500 meters). With a topographic prominence of 20,156 feet (6,144 m) and a topographic isolation of 4,621.1 miles (7,436.9 km), Denali is the third most prominent and third-most isolated peak on Earth, after Mount Everest and Aconcagua. Located in the Alaska Range in the interior of the U.S. state of Alaska, Denali is the centerpiece of Denali National Park and Preserve.", "The Koyukon people who inhabit the area around the mountain have referred to the peak as \"Denali\" for centuries. In 1896, a gold prospector named it \"Mount McKinley\" in support of then presidential candidate William McKinley, who later became the 25th president; McKinley's name was the official name recognized by the federal government of the United States from 1917 until 2015. On 29 August 2015, 40 years after Alaska had officially renamed the mountain Denali, the United States Department of the Interior under the Obama administration changed the official federal name of the mountain also to Denali. In January 2025, the Department of the Interior under the Trump administration reverted the mountain's official federal name to Mount McKinley."],
    wikipedia: "https://en.wikipedia.org/wiki/Denali",
  },
  "logan": {
    lat: 60.56722,
    lon: -140.40278,
    prominenceM: 5250,
    firstAscent: "1925 by A.H. MacCarthy et al.",
    about: ["Mount Logan ( LOH-ghən) is the highest mountain in Canada, and the second-highest peak in North America after Denali. The mountain was named after Sir William Edmond Logan, a Canadian geologist and founder of the Geological Survey of Canada (GSC). Mount Logan is located within Kluane National Park and Reserve in southwestern Yukon, less than 40 kilometres (25 miles) north of the Yukon–Alaska border. Mount Logan is the source of the Hubbard and Logan glaciers. Although many shield volcanoes are much larger in size and mass, Mount Logan is believed to have the largest base circumference of any non-volcanic mountain on Earth, including a massif with eleven peaks over 5,000 metres (16,000 feet). Mount Logan is the 6th most topographically prominent peak on Earth.", "Due to active tectonic uplifting, Mount Logan is still rising in height (approximately 0.35 millimetres (0.014 in) per year). Before 1992, the exact elevation of Mount Logan was unknown and measurements ranged from 5,959 to 6,050 metres (19,551 to 19,849 ft). In May 1992, a GSC expedition climbed Mount Logan and fixed the current height of 5,959 metres (19,551 ft) using GPS."],
    wikipedia: "https://en.wikipedia.org/wiki/Mount_Logan",
  },
  "alpamayo": {
    lat: -8.87917,
    lon: -77.65333,
    prominenceM: null,
    firstAscent: "June 20, 1957, by Günter Hauser, Berhard Huhn and Horst Wiedmann.",
    about: ["Alpamayo (possibly from Quechua allpa earth, mayu river, \"earth river\") or Shuyturaju (possibly from Ancash Quechua huytu, shuytu oblong, slim and long, Quechua rahu snow, ice, mountain covered in snow) is one of the most conspicuous peaks in the Cordillera Blanca of the Peruvian Andes. Alpamayo Creek originates northwest of it. The Alpamayo lies next to the slightly higher Quitaraju."],
    wikipedia: "https://en.wikipedia.org/wiki/Alpamayo",
  },
  "cotopaxi": {
    lat: -0.68056,
    lon: -78.43778,
    prominenceM: 2404,
    firstAscent: "28 November 1872 by Wilhelm Reiss and Ángel Escobar",
    about: ["Cotopaxi (US:  KOH-tə-PAHK-see, UK:  KOT-ə-PAK-see, Spanish: [kotoˈpaɣsi]) is an active stratovolcano in the Andes Mountains, located in Cotopaxi National Park in Cotopaxi Province, about 50 km (31.1 mi) south of Quito, and 31 km (19 mi) northeast of the city of Latacunga, Ecuador. It is the second highest summit in Ecuador (after Chimborazo), reaching a height of 5,897 m (19,347 ft). Cotopaxi is among the highest active volcanoes in the world.", "Cotopaxi is known to have erupted 87 times, resulting in the creation of numerous valleys formed by lahars (mudflows) around the volcano. An eruption began on 21 October 2022."],
    wikipedia: "https://en.wikipedia.org/wiki/Cotopaxi",
  },
  "rainier": {
    lat: 46.85167,
    lon: -121.76028,
    prominenceM: 4030,
    firstAscent: "1870 by Hazard Stevens and P. B. Van Trump",
    about: ["Mount Rainier ( ray-NEER), also known as Tahoma ( tə-HOH-mə), is a large, active stratovolcano in the Cascade Range of the Pacific Northwest in the United States. The mountain is located in Mount Rainier National Park about 59 miles (95 km) south-southeast of Seattle. At 14,406 ft (4,391 m) it is the highest mountain in the U.S. state of Washington, the most topographically prominent mountain in the contiguous United States, and the tallest in the Cascade Volcanic Arc.", "Due to its high probability of an eruption in the near future and proximity to a major urban area, Mount Rainier is considered one of the most dangerous volcanoes in the world, and it is on the Decade Volcano list. The large amount of glacial ice means that Mount Rainier could produce massive lahars that could threaten the entire Puyallup River valley and other river valleys draining Mount Rainier, including the Carbon, White, Nisqually, and Cowlitz (above Riffe Lake). According to the United States Geological Survey's 2008 report, \"about 80,000 people and their homes are at risk in Mount Rainier's lahar-hazard zones.\""],
    wikipedia: "https://en.wikipedia.org/wiki/Mount_Rainier",
  },
  "baker": {
    lat: 48.77734,
    lon: -121.8132,
    prominenceM: 2686,
    firstAscent: "1868 by Edmund Coleman, John Tennant, Thomas Stratton and David Ogilvy",
    about: ["Mount Baker, also known as Koma Kulshan or simply Kulshan, is a 10,781-foot (3,286 m) active glacier-covered andesitic stratovolcano in the Cascade Volcanic Arc and the North Cascades of Washington State in the United States. Mount Baker has the second-most thermally active crater in the Cascade Range after Mount St. Helens. About 30 miles (48 km) due east of the city of Bellingham, Whatcom County, Mount Baker is the youngest volcano in the Mount Baker volcanic field. While volcanism has persisted here for some 1.5 million years, the current volcanic cone is likely no more than 140,000 years old, and possibly no older than 80–90,000 years. Older volcanic edifices have mostly eroded away due to glaciation.", "After Mount Rainier, Mount Baker has the heaviest glacier cover of the Cascade Range volcanoes; the volume of snow and ice on Mount Baker, 0.43 cu mi (1.79 km3) is greater than that of all the other Cascades volcanoes (except Rainier) combined. It is also one of the snowiest places in the world; in 1999, Mount Baker Ski Area, located 9 mi (14.5 km) to the northeast, set the world record for recorded snowfall in a single season—1,140 in (29 m; 95 ft)."],
    wikipedia: "https://en.wikipedia.org/wiki/Mount_Baker",
  },
  "elbrus": {
    lat: 43.35254,
    lon: 42.43787,
    prominenceM: 4741,
    firstAscent: "(West summit) 1874, by Florence Crauford Grove, Frederick Gardiner, Horace Walker and the guides Peter Knubel and 22 July 1829 by Killar Kha",
    about: ["Mount Elbrus is the highest mountain in Russia and Europe. It is a dormant stratovolcano rising 5,642 m (18,510 ft) above sea level, and is the highest volcano in Eurasia, as well as the tenth-most prominent peak in the world. It is situated in the southern Russian republic of Kabardino-Balkaria in the western extension of Ciscaucasia, and is the highest peak of the Caucasus Mountains.", "Elbrus has two summits, both of which are dormant volcanic domes. The taller, western summit is 5,642 metres (18,510 ft); the eastern summit is 5,621 metres (18,442 ft). The earliest recorded ascent of the eastern summit was on 10 July 1829 by a Circassian man named Khillar Khashirov, and the western summit in 1874 by a British expedition led by F. Crauford Grove and including Frederick Gardiner, Horace Walker and the Swiss guide Peter Knubel."],
    wikipedia: "https://en.wikipedia.org/wiki/Mount_Elbrus",
  },
  "dykh-tau": {
    lat: 43.0525,
    lon: 43.13167,
    prominenceM: 2002,
    firstAscent: null,
    about: ["Dykh-Tau or Dykhtau (Russian: Дыхтау; Karachay-Balkar: Дых тау, romanized: Dıx taw, derived from Turkic \"dik dagh\" which means 'Jagged Mount'), is the second-highest mountain in Russia and Europe with an elevation of 5,205 m (17,077 ft) above sea level. It is located in Kabardino-Balkaria, Russia; its peak standing about 5 km (3 mi) north of the border with Georgia."],
    wikipedia: "https://en.wikipedia.org/wiki/Dykh-Tau",
  },
  "ararat": {
    lat: 39.70194,
    lon: 44.29833,
    prominenceM: 3611,
    firstAscent: "9 October O.S. 27 September 1829 · Friedrich Parrot, Khachatur Abovian, two Russian soldiers, two Armenian villagers",
    about: ["Mount Ararat, officially Mount Ağrı, also known as Masis, is a snow- capped and dormant compound volcano in easternmost Turkey. It consists of two major volcanic cones: Greater Ararat and Little Ararat. Greater Ararat is the highest peak in Turkey and the Armenian highlands with an elevation of 5,137 m (16,854 ft); Little Ararat's elevation is 3,896 m (12,782 ft). The Ararat massif is about 35 km (22 mi) wide at ground base. The first recorded efforts to reach Ararat's summit were made in the Middle Ages, and Friedrich Parrot, Khachatur Abovian, and four others made the first recorded ascent in 1829.", "In Europe, the mountain has been called by the name Ararat since the Middle Ages, as it began to be identified with \"mountains of Ararat\" described in the Bible as the resting place of Noah's Ark, despite contention that Genesis 8:4 does not refer specifically to a Mount Ararat."],
    wikipedia: "https://en.wikipedia.org/wiki/Mount_Ararat",
  },
  "kazbek": {
    lat: 42.69694,
    lon: 44.51889,
    prominenceM: 2373,
    firstAscent: "Yosif Buzurtanov (late 18th century)",
    about: ["Mount Kazbek or Mount Kazbegi is a dormant stratovolcano and one of the major mountains of the Caucasus, located in Georgia, just south of the border with Russia.", "Lying at 5,054 meters (16,581 ft) above at sea level, Mount Kazbek is the highest mountain in Eastern Georgia. It is also the third-highest peak in the country (after Mount Shkhara and Janga). Kazbegi is the second-highest volcanic summit in the Caucasus, after Mount Elbrus. The summit lies directly to the west of the town of Stepantsminda and is the most prominent geographic feature of the area. The last eruption occurred c. 750 BCE."],
    wikipedia: "https://en.wikipedia.org/wiki/Mount_Kazbek",
  },
  "mont-blanc": {
    lat: 45.83278,
    lon: 6.865,
    prominenceM: 4692,
    firstAscent: "8 August 1786 by Jacques Balmat · Michel-Gabriel Paccard",
    about: ["Mont Blanc (UK: ; US: ) is a mountain in the Alps, rising 4,807.3 m (15,771.9 ft) above sea level, located right at the Franco-Italian border. It is the highest mountain in Europe outside the Caucasus Mountains, the second-most prominent mountain in Europe (after Mount Elbrus in Russia), and the 11th most prominent mountain in the world.", "The mountain gives its name to its range, the Mont Blanc massif, which straddles parts of France, Italy, and Switzerland. Mont Blanc's summit lies on the watershed line between the valleys of Ferret and Veny in Italy, and the valleys of Montjoie, and Arve in France. Ownership of the summit area has long been disputed between France and Italy."],
    wikipedia: "https://en.wikipedia.org/wiki/Mont_Blanc",
  },
  "matterhorn": {
    lat: 45.97639,
    lon: 7.65861,
    prominenceM: 1043,
    firstAscent: "14 July 1865 · Edward Whymper · Charles Hudson · Francis Douglas · Douglas Robert Hadow · Michel Croz · Peter Taugwalder (father) · Peter",
    about: ["The Matterhorn is a mountain of the Alps, straddling the main watershed and border between Switzerland and Italy. It is a large, near-symmetric pyramidal peak in the extended Monte Rosa area of the Pennine Alps, whose summit is 4,478 metres (14,692 ft) above sea level, making it one of the highest summits in the Alps and Europe. Sometimes referred to as the \"Mountain of Mountains\" (German: Berg der Berge), the Matterhorn has become an indelible emblem of Switzerland and of the Alps as a whole. It has also been described as the most beautiful mountain in the world and has been claimed to be the most photographed mountain in the world. ", "The Matterhorn has four faces, each roughly oriented toward one of the four cardinal points. Three of these (north, east, and west) are on the Swiss side of the border and watershed, while the south face lies on the Italian side. These four steep faces, rising above the surrounding glaciers, are separated by the Hörnli, Furggen, Zmutt, and Leone (Lion) ridges. The mountain overlooks the Swiss town of Zermatt, in the canton of Valais, to the northeast, and the Italian town of Breuil-Cervinia in the Aosta Valley to the south. Just east of the Matterhorn is Theodul Pass, the main passage between the two valleys on its north and south sides, which has been a trade route since the Roman era."],
    wikipedia: "https://en.wikipedia.org/wiki/Matterhorn",
  },
  "eiger": {
    lat: 46.57761,
    lon: 8.00529,
    prominenceM: 361,
    firstAscent: "11 August 1858",
    about: ["The Eiger (Swiss Standard German pronunciation: [ˈaɪɡər] ) is a 3,967-metre (13,015 ft) mountain of the Bernese Alps, overlooking Grindelwald and Lauterbrunnen in the Bernese Oberland of Switzerland, just north of the main watershed and border with Valais. It is the easternmost peak of a ridge crest that extends across the Mönch to the Jungfrau at 4,158 m (13,642 ft), constituting one of the most emblematic sights of the Swiss Alps. While the northern side of the mountain rises more than 3,000 m (10,000 ft) above the two valleys of Grindelwald and Lauterbrunnen, the southern side faces the large glaciers of the Jungfrau-Aletsch area, the most glaciated region in the Alps. The most notable feature of the Eiger is its nearly 1,800-metre-high (5,900 ft) north face of rock and ice,  the biggest north face in the Alps. This substantial face towers over the resort of Kleine Scheidegg at its base, on the eponymous pass connecting the two valleys.", "The first ascent of the Eiger was made by Swiss guides Christian Almer and Peter Bohren and Irishman Charles Barrington, who climbed the west flank on August 11, 1858. The north face, the \"last problem\" of the Alps, considered amongst the most challenging and dangerous ascents, was first climbed in 1938 by an Austrian-German expedition. The Eiger has been highly publicized for the many tragedies involving climbing expeditions. Since 1935, at least 64 climbers have died attempting the north face, earning it the German nickname Mordwand, literally \"murder(ous) wall\"—a pun on its correct title of Nordwand (North Wall)."],
    wikipedia: "https://en.wikipedia.org/wiki/Eiger",
  },
  "grossglockner": {
    lat: 47.07453,
    lon: 12.69385,
    prominenceM: 2428,
    firstAscent: "28 July 1800, by Sepp and Martin Klotz (?), Martin Reicher and two others",
    about: ["The Großglockner (German: Großglockner [ˈɡroːsˌɡlɔknɐ] ), or just Glockner, is, at 3,798 metres above the Adriatic (12,461 ft), the highest mountain in Austria and highest mountain in the Alps east of the Brenner Pass. It is part of the larger Glockner Group of the Hohe Tauern range, situated along the main ridge of the Central Eastern Alps and the Alpine divide. The Pasterze, Austria's most extended glacier, lies on the Grossglockner's eastern slope.", "The characteristic pyramid-shaped peak actually consists of two pinnacles, the Großglockner and the Kleinglockner (3,770 m or 12,370 ft, from German: groß 'big', klein 'small'), separated by the Glocknerscharte col."],
    wikipedia: "https://en.wikipedia.org/wiki/Grossglockner",
  },
  "kilimanjaro": {
    lat: -3.06667,
    lon: 37.35917,
    prominenceM: 5895,
    firstAscent: "6 October 1889 by Hans Meyer and Ludwig Purtscheller",
    about: ["Mount Kilimanjaro () is a large dormant volcano in Tanzania. It is the highest mountain in Africa and the highest free-standing mountain above sea level in the world, at 5,895 m (19,341 ft) above sea level and 4,900 m (16,100 ft) above its plateau base. It is also the highest volcano in the Eastern Hemisphere and the fourth most prominent peak on Earth.", "Kilimanjaro's southern and eastern slopes served as the home of the Chagga Kingdoms until their abolition in 1963 by Julius Nyerere. The origin and meaning of the name Kilimanjaro is unknown, but may mean \"mountain of greatness\" or \"unclimbable\". Although it is described in classical sources, German missionary Johannes Rebmann is credited as the first European to report the mountain's existence, in 1848. After several European attempts, Hans Meyer reached Kilimanjaro's highest summit in 1899."],
    wikipedia: "https://en.wikipedia.org/wiki/Mount_Kilimanjaro",
  },
  "mount-kenya": {
    lat: -0.1,
    lon: 37.2,
    prominenceM: 3825,
    firstAscent: "13 September 1899 by Mackinder, Ollier, and Brocherel.",
    about: ["Mount Kenya  (Meru: Kĩrĩmaara, Kikuyu: Kĩrĩmanyaga, or \"Kīrī-nyaga\", Kamba: Ki nyaa, Embu: Kĩ nyaga, or \"Kirinyaga\") is the second highest mountain in Africa and the namesake of the country Kenya. Located about 150 km (90 mi) north-northeast of the capital of Nairobi and just 16.5 kilometres (10.3 miles) south of the equator, the mountain's highest peaks are Batian (5,199 m), Nelion (5,188 m), and Point Lenana (4,985 m). Historically situated in the former Eastern and Central provinces, the massif now serves as the intersection of Meru, Embu, Kirinyaga, Nyeri, and Tharaka Nithi counties. The area was officially gazetted as the Mount Kenya National Park in 1949 and was later designated a UNESCO World Heritage Site in 1997 for its outstanding natural beauty and ecological significance. Today, the park and its surrounding forest reserve are managed by the Kenya Wildlife Service and the Kenya Forest Service as a critical sanctuary for endangered species and a primary water tower for the region. ", "Mount Kenya is a volcano created approximately 3 million years after the opening of the East African Rift. Before glaciation, it was 7,000 m (23,000 ft) high. It was covered by an ice cap for thousands of years. This has resulted in very eroded slopes and numerous valleys radiating from the peak. There are currently 11 small glaciers, which are shrinking rapidly, and may disappear by 2050. The forested slopes are an important source of water for much of Kenya. There are several vegetation bands from the base to the peak. The lower slopes are covered by different types of forest. Many alpine species are endemic to Mount Kenya, such as the giant lobelias and senecios and a local subspecies of rock hyrax.  The park receives over 16,000 visitors per year."],
    wikipedia: "https://en.wikipedia.org/wiki/Mount_Kenya",
  },
  "stanley": {
    lat: 0.38583,
    lon: 29.87167,
    prominenceM: null,
    firstAscent: "1906 by Duke of the Abruzzi and party",
    about: ["Mount Stanley, also known as Mount Ngaliema (, also US: , UK: ), is a mountain located in the Rwenzori range. With an elevation of 5,109 m (16,763 ft), it is the highest mountain of both the Democratic Republic of the Congo and Uganda, and the fourth-highest in Africa.", "The peak and several other surrounding peaks are high enough to support glaciers. Mount Stanley is named for the colonist Sir Henry Morton Stanley. It is part of the Rwenzori Mountains National Park, a UNESCO World Heritage Site."],
    wikipedia: "https://en.wikipedia.org/wiki/Mount_Stanley",
  },
  "speke": {
    lat: 0.39806,
    lon: 29.89222,
    prominenceM: 730,
    firstAscent: "1906 by Duke of the Abruzzi",
    about: ["Mount Speke lies in the Ruwenzori Mountains National Park in Uganda and is the second highest mountain in this range. Together with Mount Stanley and Mount Baker, it forms a triangle enclosing the upper Bujuku Valley. The nearest peak is Mount Stanley, which is 3.55 km (2.21 mi) to the south-southwest. The mountains lie within an area called 'The Mountains of the Moon'.", "All mountains in this range consist of multiple jagged peaks. Mount Speke's summits are Vittorio Emanuele 4,890 m (16,040 ft); Ensonga 4,865 m (15,961 ft); Johnston 4,834 m (15,860 ft); and Trident 4,572 m (15,000 ft). The names were chosen in respect for the Italian royal family; however, the name choice had to be approved by the British Protectorate of Uganda who ruled the region at that time."],
    wikipedia: "https://en.wikipedia.org/wiki/Mount_Speke",
  },
  "toubkal": {
    lat: 31.06194,
    lon: -7.91611,
    prominenceM: 3756,
    firstAscent: "12 June 1923 by the Marquis de Segonzac, V. Berger, and H. Dolbeau",
    about: ["Toubkal (Arabic: توبقال, romanized: tūbqāl, pronounced [tuːbqaːl]), also Jbel Toubkal or Jebel Toubkal, is a mountain in central Morocco, located in the Toubkal National Park. At 4,167 m (13,671 ft), it is the highest peak in Morocco, the Atlas Mountains, North Africa and the Arab world. Located 63 km (39 mi) south of the city of Marrakesh, and visible from it, Toubkal is an ultra prominent peak, the highest for over 2,000 km (1,200 mi). Toubkal is ranked 27th by topographic isolation.", "The most common route to reach the summit of Toubkal starts from the village of Imlil in the High Atlas. The ascent typically takes two days and includes an overnight stay at a mountain refuge. The route is considered non-technical but requires good physical fitness due to the altitude."],
    wikipedia: "https://en.wikipedia.org/wiki/Toubkal",
  },
  "vinson": {
    lat: -78.52556,
    lon: -85.61722,
    prominenceM: 4892,
    firstAscent: "1966 by Nicholas Clinch and party",
    about: ["Vinson Massif () is a large mountain massif in Antarctica that is 21 km (13 mi) long and 13 km (8 mi) wide and lies within the Sentinel Range of the Ellsworth Mountains. It overlooks the Ronne Ice Shelf near the base of the Antarctic Peninsula. The massif is located about 1,200 kilometers (750 mi) from the South Pole. Vinson Massif was discovered in January 1958 by U.S. Navy aircraft. In 1961, the Vinson Massif was named by the Advisory Committee on Antarctic Names (US-ACAN), after Carl G. Vinson, United States congressman from the state of Georgia, for his support for Antarctic exploration. On 1 November 2006, US-ACAN declared Mount Vinson and Vinson Massif to be separate entities. Vinson Massif lies within the unrecognized Chilean claim under the Antarctic Treaty System.", "Mount Vinson is the highest peak in Antarctica, at 4,892 meters (16,050 ft). It lies in the north part of Vinson Massif's summit plateau in the south portion of the main ridge of the Sentinel Range about 2 kilometers (1+1⁄4 mi) north of Hollister Peak. It was first climbed in 1966 by an American team led by Nicholas Clinch. An expedition in 2001 was the first to climb via the Eastern route, and also took GPS measurements of the height of the peak. As of February 2010, 1,400 climbers have attempted to reach the summit of Mount Vinson. Mount Vinson is ranked 6th by topographic isolation."],
    wikipedia: "https://en.wikipedia.org/wiki/Mount_Vinson",
  },
  "carstensz": {
    lat: -4.08333,
    lon: 137.18333,
    prominenceM: 4884,
    firstAscent: "1936 by Colijn, Dozy, and Wissels · 1962 by Harrer, Temple, Kippax, and Huizenga",
    about: ["Puncak Jaya (Indonesian: [ˈpuntʃak ˈdʒaja]; literally 'Victorious Peak', Damal: Nemangkawi Ninggok) or Carstensz Pyramid (, Indonesian: Piramida Carstensz, Dutch: Carstenszpiramide) on the island of New Guinea, with an elevation of 4,884 m (16,024 ft), is the highest mountain peak of an island on Earth, and the highest peak in Indonesia and within Oceania. The mountain is located in the Sudirman Range of the highlands of Mimika Regency, Central Papua, Indonesia. Puncak Jaya is ranked 5th in the world by topographic isolation.", "When regarding New Guinea as part of the Australian continent in a biogeographical sense, Puncak Jaya can be considered the highest peak in all of Oceania, with its elevation exceeding those of the highest peaks in the nearby nations of Papua New Guinea (Mount Wilhelm), New Zealand (Aoraki / Mount Cook) and Australia (Mount Kosciuszko). Puncak Jaya is therefore often listed as one of the Seven Summits. However, since Puncak Jaya is in Western New Guinea, an area administered by Indonesia and therefore geopolitically part of Southeast Asia, the peak can also be considered the 8th highest mountain in this region, after Hkakabo Razi and six others in Kachin State, Myanmar."],
    wikipedia: "https://en.wikipedia.org/wiki/Puncak_Jaya",
  },
  "aoraki": {
    lat: -43.595,
    lon: 170.14194,
    prominenceM: 3724,
    firstAscent: "1894 by Tom Fyfe, George Graham, Jack Clarke",
    about: ["Aoraki / Mount Cook is the highest mountain in New Zealand. Its height, as of 2014, is listed as 3,724 metres (12,218 feet). It is situated in the Southern Alps, the mountain range that runs the length of the South Island. A popular tourist destination, it is also a favourite challenge for mountaineers. Aoraki / Mount Cook consists of three summits: from south to north, the Low Peak (3,593 m or 11,788 ft), the Middle Peak (3,717 m or 12,195 ft) and the High Peak. The summits lie slightly south and east of the main divide of the Southern Alps, with the Tasman Glacier to the east and the Hooker Glacier to the southwest. Mount Cook is ranked 10th in the world by topographic isolation."],
    wikipedia: "https://en.wikipedia.org/wiki/Aoraki_%2F_Mount_Cook",
  },
  "fuji": {
    lat: 35.36055555555556,
    lon: 138.7275,
    prominenceM: 3776,
    firstAscent: null,
    about: ["Mount Fuji (富士山・富士の山, Fujisan, Fuji no Yama) is an active stratovolcano located on the Japanese island of Honshu, with a summit elevation of 3,776.24 m (12,389 ft 3 in). It is the highest mountain in Japan, the second-highest volcano on any Asian island (after Mount Kerinci on the Indonesian island of Sumatra), and the seventh-highest peak of an island on Earth. Mount Fuji last erupted from 1707 to 1708. "],
    wikipedia: "https://en.wikipedia.org/wiki/Mount_Fuji",
  },
  "kosciuszko": {
    lat: -36.45583,
    lon: 148.26351,
    prominenceM: 2228,
    firstAscent: null,
    about: ["Mount Kosciuszko ( KOZ-ee-USK-oh; Polish pronunciation: [kɔɕˈt͡ɕuʂ.kɔ] kosh-CHOOSH-koh; Ngarigo: Kunama Namadgi) is the highest mountain of mainland Australia, at 2,228 metres (7,310 ft) above sea level. It is located on the Main Range of the Snowy Mountains in Kosciuszko National Park, a part of the Australian Alps National Parks and Reserves, in New South Wales, and is located west of Crackenback and close to Jindabyne, near the border with Victoria. Mount Kosciuszko is ranked 35th by topographic isolation."],
    wikipedia: "https://en.wikipedia.org/wiki/Mount_Kosciuszko",
  },
};

export const peakFacts = (id: string): PeakFacts | undefined => PEAK_FACTS[id];

/** "27°59′17″N 86°55′31″E" from decimal degrees. */
export function formatCoords(lat: number, lon: number): string {
  const dms = (v: number, pos: string, neg: string) => {
    const dir = v >= 0 ? pos : neg;
    const a = Math.abs(v);
    const d = Math.floor(a);
    const m = Math.floor((a - d) * 60);
    const s = Math.round(((a - d) * 60 - m) * 60);
    return `${d}°${String(m).padStart(2, "0")}′${String(s).padStart(2, "0")}″${dir}`;
  };
  return `${dms(lat, "N", "S")} ${dms(lon, "E", "W")}`;
}
