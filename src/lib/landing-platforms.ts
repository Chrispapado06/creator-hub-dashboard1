// Platform detection for landing-page links.
//
// Given a URL the admin pasted, we figure out which platform it points at
// (Instagram / OnlyFans / Twitter / Reddit / TikTok / etc.) and surface
// the right logo on the link card. This is a pure-data file — components
// import the IconType returned and render it.

import type { IconType } from "react-icons";
import {
  SiInstagram, SiOnlyfans, SiX, SiReddit, SiTiktok, SiFacebook, SiYoutube,
  SiSnapchat, SiSpotify, SiSoundcloud, SiThreads, SiPatreon, SiTwitch,
  SiDiscord, SiPinterest, SiTumblr, SiKick, SiBluesky, SiCashapp, SiVenmo,
  SiPaypal,
} from "react-icons/si";
import { Mail, Phone, Globe, MessageCircle, Link2 } from "lucide-react";

export type PlatformInfo = {
  key: string;
  label: string;
  Icon: IconType | React.ComponentType<{ className?: string }>;
  /** Brand-ish accent color used for the link icon */
  color: string;
};

// Order matters — first match wins. We intentionally check more specific hosts
// (e.g. youtube.com) before generic ones.
const RULES: Array<{
  match: (url: URL) => boolean;
  info: PlatformInfo;
}> = [
  { match: (u) => u.hostname.endsWith("instagram.com"),     info: { key: "instagram",  label: "Instagram",   Icon: SiInstagram,  color: "#E4405F" } },
  { match: (u) => u.hostname.endsWith("threads.net") || u.hostname.endsWith("threads.com"),
                                                            info: { key: "threads",    label: "Threads",     Icon: SiThreads,    color: "#000000" } },
  { match: (u) => u.hostname.endsWith("onlyfans.com"),      info: { key: "onlyfans",   label: "OnlyFans",    Icon: SiOnlyfans,   color: "#00AFF0" } },
  { match: (u) => u.hostname.endsWith("x.com") || u.hostname.endsWith("twitter.com"),
                                                            info: { key: "x",          label: "X / Twitter", Icon: SiX,          color: "#000000" } },
  { match: (u) => u.hostname.endsWith("bsky.app") || u.hostname.endsWith("bsky.social"),
                                                            info: { key: "bluesky",    label: "Bluesky",     Icon: SiBluesky,    color: "#0085FF" } },
  { match: (u) => u.hostname.endsWith("reddit.com") || u.hostname.endsWith("redd.it"),
                                                            info: { key: "reddit",     label: "Reddit",      Icon: SiReddit,     color: "#FF4500" } },
  { match: (u) => u.hostname.endsWith("tiktok.com"),        info: { key: "tiktok",     label: "TikTok",      Icon: SiTiktok,     color: "#000000" } },
  { match: (u) => u.hostname.endsWith("facebook.com") || u.hostname.endsWith("fb.com"),
                                                            info: { key: "facebook",   label: "Facebook",    Icon: SiFacebook,   color: "#1877F2" } },
  { match: (u) => u.hostname.endsWith("youtube.com") || u.hostname === "youtu.be",
                                                            info: { key: "youtube",    label: "YouTube",     Icon: SiYoutube,    color: "#FF0000" } },
  { match: (u) => u.hostname.endsWith("snapchat.com"),      info: { key: "snapchat",   label: "Snapchat",    Icon: SiSnapchat,   color: "#FFFC00" } },
  { match: (u) => u.hostname.endsWith("twitch.tv"),         info: { key: "twitch",     label: "Twitch",      Icon: SiTwitch,     color: "#9146FF" } },
  { match: (u) => u.hostname.endsWith("kick.com"),          info: { key: "kick",       label: "Kick",        Icon: SiKick,       color: "#53FC18" } },
  { match: (u) => u.hostname.endsWith("discord.com") || u.hostname.endsWith("discord.gg"),
                                                            info: { key: "discord",    label: "Discord",     Icon: SiDiscord,    color: "#5865F2" } },
  { match: (u) => u.hostname.endsWith("spotify.com"),       info: { key: "spotify",    label: "Spotify",     Icon: SiSpotify,    color: "#1DB954" } },
  { match: (u) => u.hostname.endsWith("soundcloud.com"),    info: { key: "soundcloud", label: "SoundCloud",  Icon: SiSoundcloud, color: "#FF5500" } },
  { match: (u) => u.hostname.endsWith("patreon.com"),       info: { key: "patreon",    label: "Patreon",     Icon: SiPatreon,    color: "#FF424D" } },
  { match: (u) => u.hostname.endsWith("pinterest.com"),     info: { key: "pinterest",  label: "Pinterest",   Icon: SiPinterest,  color: "#E60023" } },
  { match: (u) => u.hostname.endsWith("tumblr.com"),        info: { key: "tumblr",     label: "Tumblr",      Icon: SiTumblr,     color: "#34526F" } },
  { match: (u) => u.hostname.endsWith("cash.app"),          info: { key: "cashapp",    label: "Cash App",    Icon: SiCashapp,    color: "#00C244" } },
  { match: (u) => u.hostname.endsWith("venmo.com"),         info: { key: "venmo",      label: "Venmo",       Icon: SiVenmo,      color: "#3D95CE" } },
  { match: (u) => u.hostname.endsWith("paypal.me") || u.hostname.endsWith("paypal.com"),
                                                            info: { key: "paypal",     label: "PayPal",      Icon: SiPaypal,     color: "#003087" } },
];

const FALLBACK: PlatformInfo = { key: "link", label: "Link", Icon: Link2, color: "currentColor" };

const EMAIL: PlatformInfo  = { key: "email",  label: "Email",  Icon: Mail,          color: "#7a6a5e" };
const PHONE: PlatformInfo  = { key: "phone",  label: "Phone",  Icon: Phone,         color: "#7a6a5e" };
const SMS: PlatformInfo    = { key: "sms",    label: "SMS",    Icon: MessageCircle, color: "#7a6a5e" };
const GENERIC: PlatformInfo = { key: "web",   label: "Website", Icon: Globe,        color: "#7a6a5e" };

/**
 * Detect the platform info for a given URL.
 * Falls back to a generic "Link" icon if nothing matches.
 */
export function detectPlatform(rawUrl: string): PlatformInfo {
  if (!rawUrl) return FALLBACK;
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith("mailto:")) return EMAIL;
  if (trimmed.startsWith("tel:"))    return PHONE;
  if (trimmed.startsWith("sms:"))    return SMS;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return FALLBACK;
  }
  for (const rule of RULES) {
    if (rule.match(url)) return rule.info;
  }
  return GENERIC;
}
