import {
  siInstagram,
  siTiktok,
  siOnlyfans,
  siSnapchat,
  siX,
  siThreads,
  siReddit,
  siFacebook,
  siMeta,
  siYoutube,
  siTwitch,
  siTelegram,
  siWhatsapp,
  siDiscord,
  siPinterest,
  siPatreon,
  siSubstack,
  siBluesky,
  siKick,
  siNotion,
  siTrello,
  siAsana,
  siClickup,
  siAirtable,
  siMailchimp,
  siGooglesheets,
  siGoogledrive,
  siGoogledocs,
  siGooglecalendar,
  siGmail,
  siStripe,
  siPaypal,
  siCashapp,
  siWise,
  siShopify,
  siLinktree,
  siCalendly,
  siZoom,
} from "simple-icons";

export interface BrandIcon {
  slug: string;
  title: string;
  path: string;
  hex: string;
}

// Top social / creator / business brands (kept in this order for the picker grid).
const RAW = [
  siInstagram,
  siTiktok,
  siOnlyfans,
  siSnapchat,
  siX,
  siThreads,
  siReddit,
  siFacebook,
  siMeta,
  siYoutube,
  siTwitch,
  siTelegram,
  siWhatsapp,
  siDiscord,
  siPinterest,
  siPatreon,
  siSubstack,
  siBluesky,
  siKick,
  siLinktree,
  siNotion,
  siTrello,
  siAsana,
  siClickup,
  siAirtable,
  siMailchimp,
  siGooglesheets,
  siGoogledrive,
  siGoogledocs,
  siGooglecalendar,
  siGmail,
  siStripe,
  siPaypal,
  siCashapp,
  siWise,
  siShopify,
  siCalendly,
  siZoom,
];

export const BRAND_ICONS: BrandIcon[] = RAW.map((i) => ({
  slug: i.slug,
  title: i.title,
  path: i.path,
  hex: i.hex,
}));

export const BRAND_BY_SLUG: Record<string, BrandIcon> = Object.fromEntries(
  BRAND_ICONS.map((b) => [b.slug, b]),
);

/** Icon strings are stored as either a raw emoji, or `si:<slug>` for a brand. */
export function brandValue(slug: string) {
  return `si:${slug}`;
}
