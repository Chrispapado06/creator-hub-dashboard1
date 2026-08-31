/** CONNECTIVITY ONLY (12-DEMO-FLAG-SPLIT): no network exists. Suppresses the
 * Supabase client and remote imagery, and shows the in-memory flight banner.
 * Implies DEMO below — a bundle with no network is necessarily on samples. */
export const OFFLINE = import.meta.env.VITE_ICEFALL_OFFLINE === "1";

/** DATA SOURCE + ACCESS (12-DEMO-FLAG-SPLIT, owner escalation: "APPS NEED TO
 * BE ONLINE"): no sign-in wall, fixture reads, in-memory writes, the sample
 * banner — while the CLIENT STAYS LIVE (only OFFLINE suppresses it), so
 * anything the anon key can honestly read or reach still works on the public
 * demo. Reads the client makes as anon are refused by RLS and fall to the
 * screens' honest states, which is truthful and fine. */
export const DEMO = OFFLINE || import.meta.env.VITE_ICEFALL_DEMO === "1";
