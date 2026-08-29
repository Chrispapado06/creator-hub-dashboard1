# ICEFALL — four parallel sessions

ICEFALL is built by four Claude sessions working in parallel on one product.
This directory is how they stay consistent.

| # | Session | Owns | Port | State |
|---|---|---|---|---|
| 01 | [Phone app](01-PHONE-APP.md) | `icefall-app/` | 5190 | Existing, ~188k lines |
| 02 | [Web](02-WEB.md) | `icefall-web/` | 5194 | Existing, waitlist public |
| 03 | [Company CRM](03-COMPANY-CRM.md) | `icefall-crm/` **(new)** + the schema + money | 5197 | Greenfield |
| 04 | [Operator CRM](04-OPERATOR-CRM.md) | `icefall-operator/` **(new)** | 5196 | Greenfield |

## Start of every session

1. Read **[`00-CONSTITUTION.md`](00-CONSTITUTION.md)** — shared doctrine, rules,
   ownership, and the owner's standing decisions.
2. Read your own brief, `01`–`04`.
3. Check **[`requests/`](requests/)** for anything another session has asked of you.
4. Skim **[`FINDINGS.md`](FINDINGS.md)** for cross-boundary issues others have logged.

## The one rule that keeps four sessions from becoming four products

**Every shared asset has exactly one owner. If you are not the owner, you file a
request — you do not edit.**

- Database schema (`icefall-supabase/`) → **03**
- Money model (`icefall-shared/money.ts`) → **03**
- Design tokens (`index.css`) → **01**
- Trek catalogue (`trekRecords.ts`) → **02**

Found a problem outside your scope? Log it in `FINDINGS.md` with `file:line`.
**Do not fix it.**
