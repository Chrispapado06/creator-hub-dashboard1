import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LngLatBounds, Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { attributionFor, icefallMapStyle } from "@/components/map/icefallStyle";
import { OFFLINE } from "@/offline/offline";
import { sync } from "@/services/repository";
import { useApp } from "@/state/AppState";
import { TABBAR_CLEAR } from "@/components/layout/chrome";

/**
 * EXPLORE — the map.
 *
 * Where the hub's map button and its "Map view" link both land. It exists
 * because the owner's Explore design draws those two controls, and a map
 * control that opened a list would be a control that does not do what it
 * says — the failure this project keeps finding in other people's software and
 * refuses to ship in its own.
 *
 * WHAT IS ON IT, AND WHY NOTHING ELSE IS. Two kinds of pin only:
 *
 *   · The curated ICEFALL mountains. Each carries the coordinates its own
 *     record holds, so a pin is a position ICEFALL actually asserts.
 *   · The athlete's own saved objectives, which carry lat/lon from the peak
 *     catalogue at the moment they were saved.
 *
 * Not on it: treks (they are routes, not points, and the trek records hold no
 * geometry), guides, companies, other people, or anything "nearby" — "nearby"
 * is Find's job, and it asks for a location before it claims one. A map that
 * scattered pins for things without positions would be decoration pretending
 * to be geography.
 *
 * OFFLINE BUILDS DRAW NO MAP. The tiles come from the network, so the offline
 * bundle says so in words rather than showing a grey rectangle that looks like
 * a map failing to load. `TerrainMap` makes the same call for the same reason.
 */

interface Pin {
  id: string;
  name: string;
  lat: number;
  lon: number;
  to: string;
  kind: "mountain" | "objective";
}

export default function ExploreMap() {
  const navigate = useNavigate();
  const { objectives } = useApp();
  const holder = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  const pins = useMemo<Pin[]>(() => {
    const curated: Pin[] = sync.mountains.map((m) => ({
      id: m.id,
      name: m.name,
      lat: m.coords.lat,
      lon: m.coords.lon,
      to: `/explore/mountain/${m.id}`,
      kind: "mountain",
    }));
    const curatedIds = new Set(curated.map((p) => p.id));
    // A saved objective that IS a curated mountain is already pinned above;
    // pinning it twice would draw two markers on one summit.
    const saved: Pin[] = objectives
      .filter((o) => !(o.curatedId && curatedIds.has(o.curatedId)) && !curatedIds.has(o.id))
      .map((o) => ({
        id: o.id,
        name: o.name,
        lat: o.lat,
        lon: o.lon,
        to: `/explore/peak/${encodeURIComponent(o.id)}`,
        kind: "objective",
      }));
    return [...curated, ...saved];
  }, [objectives]);

  useEffect(() => {
    if (OFFLINE || !holder.current || pins.length === 0) return;

    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: holder.current,
        style: icefallMapStyle,
        center: [pins[0].lon, pins[0].lat],
        zoom: 3,
        attributionControl: false,
      });
    } catch {
      setFailed(true);
      return;
    }

    const markers = pins.map((pin) => {
      // A real button, not a styled div: it is navigated to on tap and it
      // should be reachable by a keyboard and named to a screen reader.
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `Open ${pin.name}`);
      el.className =
        pin.kind === "mountain"
          ? "rounded-full border border-hairline-strong bg-obsidian/85 px-2.5 py-1 text-[11px] text-snow backdrop-blur"
          : "rounded-full border border-azure/50 bg-azure/15 px-2.5 py-1 text-[11px] text-azure backdrop-blur";
      el.textContent = pin.name;
      el.addEventListener("click", () => navigate(pin.to));
      return new Marker({ element: el, anchor: "bottom" }).setLngLat([pin.lon, pin.lat]).addTo(map);
    });

    if (pins.length > 1) {
      const bounds = pins.reduce(
        (b, p) => b.extend([p.lon, p.lat]),
        new LngLatBounds([pins[0].lon, pins[0].lat], [pins[0].lon, pins[0].lat]),
      );
      map.fitBounds(bounds, { padding: 56, maxZoom: 7, duration: 0 });
    } else {
      map.setZoom(6);
    }

    return () => {
      markers.forEach((m) => m.remove());
      map.remove();
    };
  }, [pins, navigate]);

  const curatedCount = sync.mountains.length;
  const savedCount = pins.length - curatedCount;

  if (OFFLINE) {
    return (
      <div className="flex flex-1 flex-col px-5 pt-5">
        <p className="text-[14px] text-snow">The map needs a connection.</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
          This is the offline bundle, and map tiles are fetched from the network as you pan. The
          mountains are still in the app — open them from Explore.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={holder} className="min-h-0 flex-1" />

      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-obsidian/80 px-8 text-center">
          <p className="text-[13px] text-mist">
            The map could not start on this device. The mountains are still in the app — open them
            from Explore.
          </p>
        </div>
      )}

      {/* Counts are of things that exist and are pinned — never of things
          nearby, which this screen does not know. The credit is the style's
          own, so satellite is never credited to OpenFreeMap or the reverse. */}
      <div className="shrink-0 px-5 pt-2" style={{ paddingBottom: TABBAR_CLEAR }}>
        <p className="tnum text-[11px] text-mist">
          {curatedCount} ICEFALL mountain{curatedCount === 1 ? "" : "s"}
          {savedCount > 0
            ? ` · ${savedCount} saved objective${savedCount === 1 ? "" : "s"} of yours`
            : ""}
        </p>
        {/* `attributionFor` returns the markup MapLibre's own attribution
            control expects — anchors to OpenFreeMap and OpenStreetMap — so it
            is set as HTML rather than printed as text, which showed the tags.
            The string is authored in icefallStyle.ts, not by a user. */}
        <p
          className="mt-0.5 text-[10px] text-mist-dim [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: attributionFor("icefall") }}
        />
      </div>
    </div>
  );
}
