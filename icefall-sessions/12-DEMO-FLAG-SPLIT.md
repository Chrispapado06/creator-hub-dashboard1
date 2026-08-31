# DEMO vs OFFLINE — the split (owner escalation, 2026-08-31 night)

The Vercel demos shipped built with VITE_ICEFALL_OFFLINE=1. On the public
internet that renders "imagery offline" placeholders and suppressed clients
while the connection sits right there. Owner: "APPS NEED TO BE ONLINE" —
"its not only phone app all apps need the online version with the web and all".

THE FLAG CONFLATED TWO IDEAS. Split them, in every app that reads it:

    export const DEMO = OFFLINE || import.meta.env.VITE_ICEFALL_DEMO === "1";

- DEMO governs DATA SOURCE + ACCESS: auth skip / no login walls, fixtures,
  in-memory writes, the sample banner.
- OFFLINE governs CONNECTIVITY ONLY: map tiles, remote imagery, photon/
  overpass, conditions — and NOTHING else. In apps whose only network is the
  Supabase client, the client stays LIVE under DEMO (reads hit RLS as anon and
  fall back to honest/sample states — that is fine and truthful).

VITE_ICEFALL_DEMO=1 alone  -> the internet demo: no logins, sample data,
                              every network feature live.
VITE_ICEFALL_OFFLINE=1     -> exactly today's flight behaviour, unchanged.
Neither                    -> production, unchanged.

Per app, re-point each OFFLINE reader by asking the §6aj question in flag
form: is this line about WHERE DATA COMES FROM (→ DEMO) or WHETHER THE
NETWORK EXISTS (→ OFFLINE)? tsc clean + one browser pass with DEMO=1 only.
Report immediately — redeploys fire on your word.
