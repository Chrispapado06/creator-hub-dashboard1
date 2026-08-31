import "server-only";
import type {
  Creator,
  TrackingLink,
  KeywordCost,
  DashboardRow,
} from "@/lib/types";

// Sample data for PREVIEW_MODE — lets you see the UI fully populated without a
// database. Gated behind the PREVIEW_MODE env var (off by default) and only
// imported by queries.ts when that flag is set, so it never affects real use.

export const isPreview = process.env.PREVIEW_MODE === "1";

export const mockCreators: Creator[] = [
  { id: "c1", name: "Bella Rose", of_username: "bellarose" },
  { id: "c2", name: "Maylee", of_username: "maylee" },
  { id: "c3", name: "Emma Sky", of_username: "emmasky" },
];

export const mockLinks: TrackingLink[] = [
  { id: "l1", creator_id: "c1", link_id: "84213", link_name: "Petite blonde", keyword: "petite blonde", onlyfinder_campaign: "spring-promo", url: "https://onlyfans.com/bellarose/trk/84213", created_at: "2026-05-20T12:00:00Z" },
  { id: "l2", creator_id: "c1", link_id: "84219", link_name: "Girl next door", keyword: "girl next door", onlyfinder_campaign: "spring-promo", url: "https://onlyfans.com/bellarose/trk/84219", created_at: "2026-05-21T12:00:00Z" },
  { id: "l3", creator_id: "c2", link_id: "90011", link_name: "Gamer girl", keyword: "gamer girl", onlyfinder_campaign: "summer-launch", url: "https://onlyfans.com/maylee/trk/90011", created_at: "2026-05-22T12:00:00Z" },
  { id: "l4", creator_id: "c2", link_id: "90042", link_name: "Cosplay", keyword: "cosplay", onlyfinder_campaign: "summer-launch", url: "https://onlyfans.com/maylee/trk/90042", created_at: "2026-05-23T12:00:00Z" },
  { id: "l5", creator_id: "c3", link_id: "77150", link_name: "Fitness", keyword: "fitness model", onlyfinder_campaign: "evergreen", url: "https://onlyfans.com/emmasky/trk/77150", created_at: "2026-05-24T12:00:00Z" },
];

// Per-link rolled-up numbers used to build dashboard rows + cost history.
const sample: Record<
  string,
  { clicks: number; spend: number; subscribers: number; revenue: number }
> = {
  l1: { clicks: 1240, spend: 310.5, subscribers: 58, revenue: 904.0 }, // strong ROI (green)
  l2: { clicks: 880, spend: 264.0, subscribers: 21, revenue: 312.5 }, // modest ROI (yellow)
  l3: { clicks: 2100, spend: 525.0, subscribers: 96, revenue: 1680.0 }, // strong ROI (green)
  l4: { clicks: 640, spend: 192.0, subscribers: 9, revenue: 121.0 }, // losing money (red)
  l5: { clicks: 410, spend: 98.4, subscribers: 14, revenue: 150.0 }, // slight win (yellow)
};

export function mockDashboardRows(): DashboardRow[] {
  const creatorName = new Map(mockCreators.map((c) => [c.id, c.name]));
  return mockLinks.map((link): DashboardRow => {
    const s = sample[link.id];
    return {
      link,
      creatorName: creatorName.get(link.creator_id) ?? "Unknown",
      clicks: s.clicks,
      spend: s.spend,
      subscribers: s.subscribers,
      revenue: s.revenue,
      costPerSub: s.subscribers > 0 ? s.spend / s.subscribers : null,
      roi: s.spend > 0 ? ((s.revenue - s.spend) / s.spend) * 100 : null,
    };
  });
}

export function mockCostHistory(): (KeywordCost & { label: string })[] {
  const creatorName = new Map(mockCreators.map((c) => [c.id, c.name]));
  const label = (linkId: string) => {
    const l = mockLinks.find((x) => x.id === linkId)!;
    return `${creatorName.get(l.creator_id)} · ${l.keyword}`;
  };
  const rows: (KeywordCost & { label: string })[] = [];
  const dates = ["2026-06-04", "2026-06-03", "2026-06-02"];
  let i = 0;
  for (const linkId of Object.keys(sample)) {
    const s = sample[linkId];
    dates.forEach((date, d) => {
      rows.push({
        id: `mc${i++}`,
        tracking_link_id: linkId,
        date,
        clicks: Math.round(s.clicks / 3) - d * 5,
        spend_usd: Math.round((s.spend / 3) * 100) / 100,
        created_at: `${date}T12:00:00Z`,
        label: label(linkId),
      });
    });
  }
  return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
}
