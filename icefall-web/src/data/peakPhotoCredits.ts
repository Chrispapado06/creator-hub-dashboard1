/**
 * Who took each peak photograph, and under what licence.
 *
 * THIS IS NOT OPTIONAL METADATA. The images in `public/img/peaks` are
 * redistributed copies of other people's work: 15 are CC BY-SA 3.0, 13 are
 * CC BY-SA 4.0, and the rest span nine more licences. Every CC BY and CC BY-SA
 * licence requires the author named wherever the work appears. Shipping the
 * photographs without this file would be a licence breach, not an oversight,
 * so the credits sit beside the images rather than in a README nobody renders.
 *
 * Resolved from each mountain's English Wikipedia lead image, then its licence
 * and author read from the Commons `extmetadata` for that exact file. Four are
 * public domain and one of those (Gasherbrum II, whose article carries no lead
 * image and which came from its Commons category instead) names no author.
 *
 * Regenerate with `scratchpad/peakphotos.mjs` if the catalogue changes.
 */

export interface PeakPhotoCredit {
  /** The photographer, as Commons records them. Null only where none is named. */
  credit: string | null;
  license: string;
  /** The Commons file page — the linked half of the attribution. */
  pageUrl: string;
}

export const PEAK_PHOTO_CREDITS: Record<string, PeakPhotoCredit> = {
  "everest": { credit: "Rdevany", license: "CC BY-SA 3.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Mt._Everest_from_Gokyo_Ri_November_5,_2012.jpg" },
  "k2": { credit: "Zacharie Grossen", license: "CC BY-SA 4.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Chogori.jpg" },
  "kangchenjunga": { credit: "Tomabarker", license: "CC BY 3.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Kangchenjunga_PangPema.JPG" },
  "lhotse": { credit: "Uwe Gille", license: "CC BY-SA 3.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Lhotse-fromChukhungRi.jpg" },
  "makalu": { credit: "Ben Tubby", license: "CC BY 2.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Makalu.jpg" },
  "cho-oyu": { credit: "Robstar06 at German Wikipedia", license: "Public domain", pageUrl: "https://commons.wikimedia.org/wiki/File:Chooyu.jpg" },
  "dhaulagiri": { credit: "Sergey Ashmarin", license: "CC BY-SA 3.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Dhaulagiri_-_view_from_aircraft.jpg" },
  "manaslu": { credit: "Ben Tubby", license: "CC BY 2.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Sunrise,_Manaslu.jpg" },
  "nanga-parbat": { credit: "Imrankhakwani", license: "CC BY-SA 4.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Fairy_Meadows_and_the_view_of_Nanga_Parbat.jpg" },
  "annapurna": { credit: "PrajwalMohan", license: "CC BY-SA 4.0", pageUrl: "https://commons.wikimedia.org/wiki/File:South_Face_of_Annapurna_I_(Main).jpg" },
  "gasherbrum-i": { credit: "Dr. Olaf Rieck (http://www.olafrieck.de)", license: "CC BY-SA 3.0", pageUrl: "https://commons.wikimedia.org/wiki/File:HiddenPeak.jpg" },
  "broad-peak": { credit: "Kogo", license: "CC BY-SA 3.0", pageUrl: "https://commons.wikimedia.org/wiki/File:7_15_BroadPeak.jpg" },
  "gasherbrum-ii": { credit: null, license: "Public domain", pageUrl: "https://commons.wikimedia.org/wiki/File:Gasherbrum2.jpg" },
  "shishapangma": { credit: "Hiroki Ogawa", license: "CC BY 3.0", pageUrl: "https://commons.wikimedia.org/wiki/File:8,013m_Shishapangma_Tibet_China_%E8%A5%BF%E8%97%8F_%E5%B8%8C%E5%A4%8F%E9%82%A6%E9%A9%AC%E5%B3%B0_-_panoramio.jpg" },
  "muztagh-tower": { credit: "Kogo (talk · contribs)", license: "GFDL", pageUrl: "https://commons.wikimedia.org/wiki/File:MuztaghTower.jpg" },
  "lenin-peak": { credit: "Nihongarden", license: "CC BY-SA 3.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Lenin_peak_from_Sary-mogol.jpg" },
  "baruntse": { credit: "Mathias Zehring", license: "CC BY-SA 3.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Baruntse_wp.jpg" },
  "himlung-himal": { credit: "Michi Waerthl", license: "CC BY-SA 4.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Nemjung_Gipfel_7140_Meter.jpg" },
  "khan-tengri": { credit: "Frederic Heymes", license: "CC BY-SA 2.0 fr", pageUrl: "https://commons.wikimedia.org/wiki/File:Vue_globale_du_versant_N_du_khan_Tengri.jpg" },
  "ama-dablam": { credit: "Vyacheslav Argenberg", license: "CC BY 4.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Himalayas,_Ama_Dablam,_Nepal.jpg" },
  "kailash": { credit: "Ondřej Žváček", license: "CC BY 2.5", pageUrl: "https://commons.wikimedia.org/wiki/File:Kailash_north.JPG" },
  "mera-peak": { credit: "Mark Horrell", license: "CC BY-SA 4.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Mera_Peak_Zatr_La.JPG" },
  "island-peak": { credit: "Kogo", license: "GFDL", pageUrl: "https://commons.wikimedia.org/wiki/File:ImjaTse.jpg" },
  "lobuche-east": { credit: "Theprotrekker", license: "CC BY-SA 4.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Lobuche_East_Peak.jpg" },
  "aconcagua": { credit: "Bjørn Christian Tørrissen", license: "CC BY-SA 4.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Aconcagua2016.jpg" },
  "ojos-del-salado": { credit: "sergejf", license: "CC BY-SA 2.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Ojos_del_Salado_looming_big_on_the_horizon.jpg" },
  "huascaran": { credit: "MrBasically", license: "CC BY-SA 4.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Nevado_Huascar%C3%A1n_(south_view).jpg" },
  "chimborazo": { credit: "Dick Culbert from Gibsons, B.C., Canada", license: "CC BY 2.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Chimborazo,_aspecto_norte,_Ecuador._(26354503702).jpg" },
  "denali": { credit: "Denali National Park and Preserve", license: "Public domain", pageUrl: "https://commons.wikimedia.org/wiki/File:Wonder_Lake_and_Denali.jpg" },
  "logan": { credit: "Gerald Holdsworth", license: "Public domain", pageUrl: "https://commons.wikimedia.org/wiki/File:Mount_Logan.jpg" },
  "alpamayo": { credit: "Brad MeringBaltimore, MD, United States", license: "Copyrighted free use", pageUrl: "https://commons.wikimedia.org/wiki/File:Alpamayo.jpg" },
  "cotopaxi": { credit: "Gerard Prins", license: "CC BY-SA 3.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Cotopaxi_volcano_2008-06-27T1322.jpg" },
  "rainier": { credit: "Caleb Riston", license: "CC0", pageUrl: "https://commons.wikimedia.org/wiki/File:Rainier20200906.jpg" },
  "baker": { credit: "Lhb1239", license: "CC BY-SA 3.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Mount_Baker_from_Boulder_Creek.jpg" },
  "elbrus": { credit: "Aleksandr Markin", license: "CC BY-SA 2.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Mount_Elbrus_(cropped).jpg" },
  "dykh-tau": { credit: "Shaman17", license: "CC BY-SA 3.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Dykhtau.jpg" },
  "ararat": { credit: "Սէրուժ Ուրիշեան (Serouj Ourishian)", license: "CC BY 4.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Mount_Ararat_and_the_Yerevan_skyline_in_spring_(50mm).jpg" },
  "kazbek": { credit: "Vyacheslav Argenberg", license: "CC BY 4.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Kazbegi,_Mount_Kazbek,_Georgia.jpg" },
  "mont-blanc": { credit: "Hseugut", license: "CC BY-SA 4.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Mont_Blanc_Aiguille.jpg" },
  "matterhorn": { credit: "Photo: chil, on Camptocamp.org Derivative work:Zacharie Grossen", license: "CC BY-SA 3.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Matterhorn_from_Domh%C3%BCtte_-_2.jpg" },
  "eiger": { credit: "Terra3", license: "CC BY-SA 3.0", pageUrl: "https://commons.wikimedia.org/wiki/File:North_face.jpg" },
  "grossglockner": { credit: "Michieliosios", license: "CC BY-SA 3.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Gro%C3%9Fglockner_from_behind_the_glass_panorama_tower.JPG" },
  "kilimanjaro": { credit: "Sergey Pesterev", license: "CC BY-SA 4.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Kilimanjaro_from_Amboseli.jpg" },
  "mount-kenya": { credit: "Don Elvis Muraya", license: "CC BY-SA 4.0", pageUrl: "https://commons.wikimedia.org/wiki/File:MtKenya.jpg" },
  "stanley": { credit: "El.Sarmiento", license: "CC BY-SA 3.0", pageUrl: "https://commons.wikimedia.org/wiki/File:MtStanley_2.JPG" },
  "speke": { credit: "Albert Backer", license: "CC BY-SA 3.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Mt.Speke2008.jpg" },
  "toubkal": { credit: "SimonKing74", license: "CC0", pageUrl: "https://commons.wikimedia.org/wiki/File:My_Toubkal.jpg" },
  "vinson": { credit: "Christian Stangl", license: "CC BY-SA 2.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Mount_Vinson_from_NW_at_Vinson_Plateau_by_Christian_Stangl_(flickr).jpg" },
  "carstensz": { credit: "Enda Kaban", license: "CC BY-SA 4.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Carstenzs_Piramida_Mountain.jpg" },
  "aoraki": { credit: "Jörg Hempel", license: "CC BY-SA 3.0 de", pageUrl: "https://commons.wikimedia.org/wiki/File:Mt_Cook_LC0247.jpg" },
  "fuji": { credit: "Suicasmo", license: "CC BY-SA 4.0", pageUrl: "https://commons.wikimedia.org/wiki/File:View_of_Mount_Fuji_from_%C5%8Cwakudani_20211202.jpg" },
  "kosciuszko": { credit: "MrActiniuM", license: "CC BY-SA 4.0", pageUrl: "https://commons.wikimedia.org/wiki/File:Kosciusko_Mountain_view_from_the_track.jpg" },
};

/** Photograph, credit and licence for a peak, or undefined if it has none. */
export const peakCredit = (id: string): PeakPhotoCredit | undefined =>
  PEAK_PHOTO_CREDITS[id];
