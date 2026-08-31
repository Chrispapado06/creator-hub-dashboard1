// Domain types for the OnlyFinder experiment-tracker dashboard.
// These read the tables created by the supabase/migrations Stage 1–5 files.

export type TrackerCreator = {
  id: string;
  name: string;
  of_username: string | null;
  onlyfansapi_acct_id: string | null; // OFAPI ref
  onlyfinder_ref: string | null;
  daily_budget_usd: number | null;
  other_platforms: string[] | null;
};

export type KeywordChange = {
  id: string;
  creator_id: string;
  changed_on: string;
  previous_keywords: string[];
  new_keywords: string[];
  action: string | null;
  note: string | null;
  created_at: string;
};

export type DailyMetric = {
  metric_date: string;
  total_new_fans: number;
  total_income_usd: number;
  direct_fans: number;
  direct_income_usd: number;
  onlyfinder_spend_usd: number | null;
};

export type ExperimentStatus = "running" | "confounded" | "concluded" | "insufficient_data";

export type Experiment = {
  id: string;
  creator_id: string;
  keyword_change_id: string;
  status: ExperimentStatus;
  baseline_start: string;
  baseline_end: string;
  observation_start: string;
  observation_end: string;
  baseline_fans_per_day: number | null;
  observed_fans_per_day: number | null;
  fans_lift_pct: number | null;
  baseline_income_per_day: number | null;
  observed_income_per_day: number | null;
  income_lift_pct: number | null;
  baseline_fans_per_dollar: number | null;
  observed_fans_per_dollar: number | null;
  fans_per_dollar_lift_pct: number | null;
  confounded_reason: string | null;
  concluded_at: string | null;
};

export type DigestItem = {
  experiment_id: string;
  status_line: string;
  read: string;
  recommended_action: "hold" | "scale" | "kill" | "unreadable";
  confound_warning: string | null;
};

export type DailyDigest = {
  id: string;
  digest_date: string;
  prose_summary: string;
  items: DigestItem[];
  model: string | null;
  created_at: string;
};

export type DecisionBucket = "scale" | "hold" | "kill";

export type DecisionRow = {
  id: string;
  creator_id: string;
  creator_name: string;
  fans_lift_pct: number | null;
  income_lift_pct: number | null;
  observation_end: string;
};
