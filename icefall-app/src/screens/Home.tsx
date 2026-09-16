/**
 * Home — the new layout by default, the previous one on request.
 *
 * The owner asked for Home rebuilt to the eight-state mockup boards and for the
 * old version to be kept "in case i dont like new one" (2026-09-16). Settings →
 * Home layout flips between them on this device; `/home/classic` always shows
 * the old one.
 */
import HomeClassic from "@/screens/HomeClassic";
import HomeNew from "@/screens/home/HomeNew";
import { useSettings } from "@/settings/store";

export default function Home() {
  const { settings } = useSettings();
  return settings.homeLayout === "classic" ? <HomeClassic /> : <HomeNew />;
}
