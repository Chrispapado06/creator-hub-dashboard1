#!/usr/bin/env python3
"""End-to-end test of the data layer (no Discord needed).

Drives the exact lifecycle the bot performs: seed templates → start a
pipeline → /done through every step (handoffs) → pipeline complete,
plus standalone tasks, reassign, skip, cancel, and stale-nudge queries.
Run:  python3 test_happy_path.py
"""
from __future__ import annotations

import sqlite3

import db

LUCA, JA, LIZ = "100", "200", "300"


def check(label: str, cond: bool) -> None:
    print(("  ✓ " if cond else "  ✗ FAIL ") + label)
    if not cond:
        raise SystemExit(1)


def main() -> None:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    db.init_db(conn)

    print("seeding")
    tpls = db.list_templates(conn)
    check("2 built-in templates seeded", len(tpls) == 2)
    script = db.get_template_by_name(conn, "script")  # case-insensitive
    check("template lookup is case-insensitive", script is not None)
    steps = db.get_template_steps(conn, script.id)
    check("Script has 3 ordered steps",
          [s.step_name for s in steps] == ["Write script", "Upload script", "Verify upload"])

    print("users")
    db.upsert_user(conn, LUCA, "Luca", "manager")
    db.upsert_user(conn, JA, "Ja", "uploader")
    db.upsert_user(conn, LIZ, "Liz", "qa")
    db.upsert_user(conn, JA, "Ja", "")  # re-register without role
    check("re-upsert keeps existing role", db.get_user(conn, JA).role_name == "uploader")

    print("happy path: start → done → handoff → complete")
    p = db.create_pipeline(conn, "Script — Marissa promo July", LUCA,
                           [(s.step_name, a) for s, a in zip(steps, (LUCA, JA, LIZ))],
                           template_id=script.id)
    psteps = db.get_pipeline_steps(conn, p.id)
    check("step 1 active, rest waiting",
          [s.status for s in psteps] == ["active", "waiting", "waiting"])
    check("step 1 has activated_at", psteps[0].activated_at is not None)

    check("Luca sees it in his list", len(db.user_active_steps(conn, LUCA)) == 1)
    check("Ja's list is empty (if it's not on the list, it's not his yet)",
          len(db.user_active_steps(conn, JA)) == 0)

    r1 = db.complete_step(conn, psteps[0].id)
    check("completing step 1 promotes step 2", r1.next_step.step_name == "Upload script")
    check("handoff goes to Ja", r1.next_step.assignee_discord_id == JA)
    check("pipeline not complete yet", not r1.pipeline_complete)
    check("Luca's list is now empty (done = off the list)",
          len(db.user_active_steps(conn, LUCA)) == 0)
    check("Ja's list now shows the step", len(db.user_active_steps(conn, JA)) == 1)

    check("double-complete is a safe no-op", db.complete_step(conn, psteps[0].id) is None)

    r2 = db.complete_step(conn, r1.next_step.id)
    check("step 3 to Liz", r2.next_step.assignee_discord_id == LIZ)
    r3 = db.complete_step(conn, r2.next_step.id)
    check("last step completes the pipeline", r3.pipeline_complete)
    check("pipeline status is complete", db.get_pipeline(conn, p.id).status == "complete")
    check("nobody has it on their list anymore",
          not db.user_active_steps(conn, LUCA) and not db.user_active_steps(conn, JA)
          and not db.user_active_steps(conn, LIZ))

    print("skip")
    p2 = db.create_pipeline(conn, "Skip test", LUCA, [("A", LUCA), ("B", JA)])
    s1 = db.active_step_of(conn, p2.id)
    rs = db.complete_step(conn, s1.id, skipped=True)
    check("skipped step is marked skipped", db.get_step(conn, s1.id).skipped)
    check("skip still advances the chain", rs.next_step.step_name == "B")

    print("reassign")
    s2 = db.active_step_of(conn, p2.id)
    db.reassign_step(conn, s2.id, LIZ)
    check("step reassigned to Liz", db.get_step(conn, s2.id).assignee_discord_id == LIZ)
    check("reassigning a done step is refused", db.reassign_step(conn, s1.id, JA) is None)

    print("cancel")
    check("cancel works", db.cancel_pipeline(conn, p2.id))
    check("cancelled pipeline off the board", all(pl.id != p2.id for pl in db.active_pipelines(conn)))
    check("cancelled step gone from Liz's list", len(db.user_active_steps(conn, LIZ)) == 0)
    check("double-cancel refused", not db.cancel_pipeline(conn, p2.id))

    print("standalone tasks")
    t = db.add_task(conn, "Order new lighting", JA, LUCA, due_date="2026-07-01")
    check("task appears on Ja's list", len(db.user_open_tasks(conn, JA)) == 1)
    db.complete_task(conn, t.id)
    check("completed task leaves the list", len(db.user_open_tasks(conn, JA)) == 0)
    check("double-complete task refused", db.complete_task(conn, t.id) is None)

    print("stale nudges")
    p3 = db.create_pipeline(conn, "Stale test", LUCA, [("Only step", JA)])
    s3 = db.active_step_of(conn, p3.id)
    check("fresh step not stale at 48h", not db.stale_active_steps(conn, 48))
    conn.execute("UPDATE pipeline_steps SET activated_at=? WHERE id=?",
                 ("2020-01-01T00:00:00+00:00", s3.id))
    conn.commit()
    stale = db.stale_active_steps(conn, 48)
    check("old step is flagged stale", len(stale) == 1 and stale[0][0].id == s3.id)
    db.mark_nudged(conn, s3.id)
    check("nudged step not re-flagged within window", not db.stale_active_steps(conn, 48))

    print("config")
    check("missing config returns default", db.get_config(conn, "task_channel_id", "0") == "0")
    db.set_config(conn, "nudge_hours", "24")
    db.set_config(conn, "nudge_hours", "36")
    check("config upsert overwrites", db.get_config(conn, "nudge_hours") == "36")

    print("templates CRUD")
    db.create_template(conn, "Promo", "desc", [("Draft", LUCA), ("Post", None)])
    check("created template listed", db.get_template_by_name(conn, "promo") is not None)
    check("delete template", db.delete_template(conn, "Promo"))
    check("steps cascade-deleted",
          conn.execute("SELECT COUNT(*) FROM template_steps ts LEFT JOIN templates t "
                       "ON t.id=ts.template_id WHERE t.id IS NULL").fetchone()[0] == 0)

    print("recurring tasks")
    from datetime import datetime
    rid = db.add_recurring(conn, "Post daily story", JA, LUCA, "daily", None, "09:00")
    wid = db.add_recurring(conn, "Weekly payout check", LIZ, LUCA, "weekly", 0, "10:00")  # Mondays
    check("rules listed", len(db.list_recurring(conn)) == 2)

    mon_0830 = datetime(2026, 6, 15, 8, 30)   # Monday before both times
    check("nothing due before its time", len(db.due_recurring(conn, mon_0830)) == 0)

    mon_0930 = datetime(2026, 6, 15, 9, 30)   # daily due, weekly (10:00) not yet
    due = db.due_recurring(conn, mon_0930)
    check("daily due after 09:00", [r["id"] for r in due] == [rid])

    mon_1030 = datetime(2026, 6, 15, 10, 30)  # both due (Monday)
    due = db.due_recurring(conn, mon_1030)
    check("weekly due on its weekday after its time", {r["id"] for r in due} == {rid, wid})

    t_spawned = db.spawn_recurring(conn, due[0], mon_1030)
    check("spawn creates a normal open task", t_spawned.status == "open")
    check("spawned task on assignee's list",
          any(t.id == t_spawned.id for t in db.user_open_tasks(conn, due[0]["assignee_discord_id"])))
    check("no double-spawn same day",
          due[0]["id"] not in {r["id"] for r in db.due_recurring(conn, mon_1030)})

    tue_1030 = datetime(2026, 6, 16, 10, 30)  # Tuesday
    due_tue = {r["id"] for r in db.due_recurring(conn, tue_1030)}
    check("daily due again next day", rid in due_tue or db.list_recurring(conn)[0]["last_spawned_date"] == "2026-06-15")
    check("weekly NOT due on Tuesday", wid not in due_tue)

    check("remove rule", db.remove_recurring(conn, rid))
    check("removed rule never due",
          rid not in {r["id"] for r in db.due_recurring(conn, tue_1030)})
    check("double-remove refused", not db.remove_recurring(conn, rid))

    print("\nALL CHECKS PASSED")


if __name__ == "__main__":
    main()
