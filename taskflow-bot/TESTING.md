# TaskFlow — manual test script

Pre-flight: bot running, invited, and `/setup channel #tasks` done. You need
2–3 humans (or one human with an alt account) to test handoffs properly —
call them **A** (admin), **B**, **C**.

Run `python3 test_happy_path.py` first — the data layer must print
`ALL CHECKS PASSED` before bothering with Discord.

## 1. Setup
| # | Do | Expect |
|---|---|---|
| 1 | A: `/setup channel #tasks` | ephemeral "Task channel set" |
| 2 | A: `/setup member @A manager`, `@B uploader`, `@C qa` | ephemeral confirms |
| 3 | B (no Manage Server): `/setup nudge 24` | refused — admin only |

## 2. Template create
| # | Do | Expect |
|---|---|---|
| 4 | A: `/template create name:Promo` | modal opens |
| 5 | Enter steps: `Draft copy` / `Schedule post` (one per line), submit | ephemeral assignee walkthrough, one person picker per step |
| 6 | Pick B for step 1; press "No default" for step 2 | "Template Promo created ✅" listing both steps |
| 7 | A: `/template list` | Script, Content Request, Promo all listed with steps |

## 3. Pipeline happy path (the core)
| # | Do | Expect |
|---|---|---|
| 8 | A: `/start template:Script title:Script — Test run` | Script has no default assignees → walkthrough asks for all 3; assign A, B, C |
| 9 | — | #tasks gets 🚀 embed pinging **A**, full chain shown, step 1 ▶️ |
| 10 | C: `/tasks @A` | shows the step on A's list |
| 11 | C: `/tasks @B` | **empty** — "all clear" (not B's turn yet) |
| 12 | A: `/done` | #tasks gets 🔁 "Step 2/3: Upload script → @B (handed off by @A)" |
| 13 | A: `/mytasks` | empty — done = off the list |
| 14 | B: `/mytasks` | shows step 2, with ⏳ hold time |
| 15 | B: `/done` | 🔁 step 3 → C pinged |
| 16 | C: `/done` | ✅ "Pipeline complete" summary, all steps ✅ |
| 17 | Anyone: `/board` | pipeline no longer listed |

## 4. /board accuracy
| # | Do | Expect |
|---|---|---|
| 18 | A: `/start Script` twice with different titles (assign all to B) | both pinged |
| 19 | Anyone: `/board` | both pipelines, each "Step 1/3 — @B ⏳ <fresh time>" |
| 20 | B: `/done` | select menu (B has 2 active steps) — pick one; only that pipeline advances; `/board` reflects it |

## 5. Standalone tasks
| # | Do | Expect |
|---|---|---|
| 21 | A: `/task add user:@B title:Order lighting due:2026-07-01` | #tasks pings B with 📋 embed |
| 22 | A: `/task add ... due:tomorrow` | rejected — must be YYYY-MM-DD |
| 23 | B: `/mytasks` | task listed with due date |
| 24 | B: `/done` | if B also holds pipeline steps → select menu mixes 🔁 and 📋; completing the task removes it |

## 6. Reassign / skip / cancel
| # | Do | Expect |
|---|---|---|
| 25 | A: `/reassign step:<pick> user:@C` | #tasks: "reassigned to @C (was @B, by @A)"; C's `/mytasks` shows it |
| 26 | B (not assignee, not admin): `/skip step:<C's step>` | refused |
| 27 | C: `/skip step:<own step>` | step advances, chain shows *(skipped)* |
| 28 | B: `/cancel pipeline:<not B's>` | refused (B isn't creator/admin) |
| 29 | A: `/cancel pipeline:<pick>` | 🛑 posted; gone from `/board` and everyone's lists |

## 7. Restart safety
| # | Do | Expect |
|---|---|---|
| 30 | Start a pipeline, complete step 1, then `Ctrl-C` the bot and restart | `/board`, `/mytasks` identical after restart; `/done` continues the chain correctly |

## 8. Stale nudge (configurable threshold)
| # | Do | Expect |
|---|---|---|
| 31 | A: `/setup nudge 1`; leave a step active >1h (or backdate `activated_at` in taskflow.db with sqlite3) | within the next 12h-loop tick: 👋 nudge in #tasks pinging the holder |
| 32 | Wait for the next tick | no duplicate nudge inside the threshold window |

Fastest way to force a nudge without waiting:
```bash
sqlite3 taskflow.db "UPDATE pipeline_steps SET activated_at='2020-01-01T00:00:00+00:00' WHERE status='active';"
```
then restart the bot (the loop runs on startup).
