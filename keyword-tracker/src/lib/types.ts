// Shared row/domain types for the keyword-tracker app.

/** Existing `creators` row (we only read the columns we need). */
export type Creator = {
  id: string;
  name: string;
  of_username: string | null;
};

export type TrackingLink = {
  id: string;
  creator_id: string;
  link_id: string;
  link_name: string | null;
  keyword: string;
  onlyfinder_campaign: string | null;
  url: string | null;
  created_at: string;
};

export type KeywordCost = {
  id: string;
  tracking_link_id: string;
  date: string; // YYYY-MM-DD
  clicks: number;
  spend_usd: number;
  created_at: string;
};

export type SubscriberSnapshot = {
  id: string;
  tracking_link_id: string;
  date_pulled: string;
  subscriber_count: number;
  total_revenue_usd: number;
  created_at: string;
};

/**
 * One fully-joined row for the dashboard: a tracking link with its rolled-up
 * cost (clicks + spend) and its latest subscriber/revenue snapshot, plus the
 * derived attribution metrics.
 */
export type DashboardRow = {
  link: TrackingLink;
  creatorName: string;
  clicks: number;
  spend: number;
  subscribers: number;
  revenue: number;
  costPerSub: number | null; // null when subscribers === 0
  roi: number | null; // percent; null when spend === 0
};
