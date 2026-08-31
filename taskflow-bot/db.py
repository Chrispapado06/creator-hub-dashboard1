# Data layer. Every state change in TaskFlow goes through a function in
# this file — the cog never writes SQL. All timestamps are UTC ISO-8601
# strings. The bot is restart-safe because nothing lives outside SQLite.
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from models import Pipeline, PipelineStep, Task, Template, TemplateStep, User

DB_PATH = Path(__file__).resolve().parent / "taskflow.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    discord_id   TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    role_name    TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS templates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS template_steps (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    step_order  INTEGER NOT NULL,
    step_name   TEXT NOT NULL,
    default_assignee_discord_id TEXT
);

CREATE TABLE IF NOT EXISTS pipelines (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER REFERENCES templates(id) ON DELETE SET NULL,
    title       TEXT NOT NULL,
    created_by  TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','complete','cancelled'))
);

CREATE TABLE IF NOT EXISTS pipeline_steps (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    pipeline_id INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    step_order  INTEGER NOT NULL,
    step_name   TEXT NOT NULL,
    assignee_discord_id TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'waiting'
                CHECK (status IN ('waiting','active','done')),
    activated_at  TEXT,
    completed_at  TEXT,
    skipped       INTEGER NOT NULL DEFAULT 0,
    last_nudged_at TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    assignee_discord_id TEXT NOT NULL,
    created_by  TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
    due_date    TEXT,
    created_at  TEXT NOT NULL,
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS recurring_tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    assignee_discord_id TEXT NOT NULL,
    created_by  TEXT NOT NULL,
    frequency   TEXT NOT NULL CHECK (frequency IN ('daily','weekly')),
    weekday     INTEGER,            -- 0=Mon … 6=Sun; only for weekly
    time_hhmm   TEXT NOT NULL DEFAULT '09:00',
    last_spawned_date TEXT,         -- local YYYY-MM-DD of the last spawn
    active      INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_psteps_pipeline ON pipeline_steps(pipeline_id, step_order);
CREATE INDEX IF NOT EXISTS idx_psteps_assignee ON pipeline_steps(assignee_discord_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee  ON tasks(assignee_discord_id, status);
"""

SEED_TEMPLATES: Sequence[Tuple[str, str, Sequence[str]]] = (
    ("Script", "Write → upload → verify a script",
     ("Write script", "Upload script", "Verify upload")),
    ("Content Request", "Request → organize → QC content from a model",
     ("Request content from model", "Receive & organize content", "Quality check")),
)


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get_conn(path: Path = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    # Seed built-in templates only on a fresh DB so user edits stick.
    if conn.execute("SELECT COUNT(*) FROM templates").fetchone()[0] == 0:
        for name, desc, steps in SEED_TEMPLATES:
            tid = conn.execute(
                "INSERT INTO templates(name, description) VALUES (?,?)", (name, desc)
            ).lastrowid
            for i, step in enumerate(steps, start=1):
                conn.execute(
                    "INSERT INTO template_steps(template_id, step_order, step_name) VALUES (?,?,?)",
                    (tid, i, step),
                )
    conn.commit()


# ── Config ───────────────────────────────────────────────────────────

def get_config(conn: sqlite3.Connection, key: str, default: Optional[str] = None) -> Optional[str]:
    row = conn.execute("SELECT value FROM config WHERE key=?", (key,)).fetchone()
    return row["value"] if row else default


def set_config(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO config(key, value) VALUES (?,?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, value),
    )
    conn.commit()


# ── Users ────────────────────────────────────────────────────────────

def upsert_user(conn: sqlite3.Connection, discord_id: str, display_name: str, role_name: str = "") -> None:
    conn.execute(
        "INSERT INTO users(discord_id, display_name, role_name) VALUES (?,?,?) "
        "ON CONFLICT(discord_id) DO UPDATE SET display_name=excluded.display_name, "
        "role_name=CASE WHEN excluded.role_name='' THEN users.role_name ELSE excluded.role_name END",
        (discord_id, display_name, role_name),
    )
    conn.commit()


def get_user(conn: sqlite3.Connection, discord_id: str) -> Optional[User]:
    r = conn.execute("SELECT * FROM users WHERE discord_id=?", (discord_id,)).fetchone()
    return User.from_row(r) if r else None


def display_name(conn: sqlite3.Connection, discord_id: str) -> str:
    u = get_user(conn, discord_id)
    return u.display_name if u else f"user {discord_id}"


# ── Templates ────────────────────────────────────────────────────────

def list_templates(conn: sqlite3.Connection) -> List[Template]:
    return [Template.from_row(r) for r in conn.execute("SELECT * FROM templates ORDER BY name")]


def get_template_by_name(conn: sqlite3.Connection, name: str) -> Optional[Template]:
    r = conn.execute("SELECT * FROM templates WHERE name=? COLLATE NOCASE", (name,)).fetchone()
    return Template.from_row(r) if r else None


def get_template_steps(conn: sqlite3.Connection, template_id: int) -> List[TemplateStep]:
    return [
        TemplateStep.from_row(r)
        for r in conn.execute(
            "SELECT * FROM template_steps WHERE template_id=? ORDER BY step_order",
            (template_id,),
        )
    ]


def create_template(conn: sqlite3.Connection, name: str, description: str,
                    steps: Sequence[Tuple[str, Optional[str]]]) -> int:
    """steps: ordered (step_name, default_assignee_discord_id or None)."""
    tid = conn.execute(
        "INSERT INTO templates(name, description) VALUES (?,?)", (name, description)
    ).lastrowid
    for i, (step_name, assignee) in enumerate(steps, start=1):
        conn.execute(
            "INSERT INTO template_steps(template_id, step_order, step_name, default_assignee_discord_id) "
            "VALUES (?,?,?,?)",
            (tid, i, step_name, assignee),
        )
    conn.commit()
    return tid


def set_template_step_assignee(conn: sqlite3.Connection, step_id: int, assignee: Optional[str]) -> None:
    conn.execute(
        "UPDATE template_steps SET default_assignee_discord_id=? WHERE id=?",
        (assignee, step_id),
    )
    conn.commit()


def delete_template(conn: sqlite3.Connection, name: str) -> bool:
    cur = conn.execute("DELETE FROM templates WHERE name=? COLLATE NOCASE", (name,))
    conn.commit()
    return cur.rowcount > 0


# ── Pipelines ────────────────────────────────────────────────────────

def create_pipeline(conn: sqlite3.Connection, title: str, created_by: str,
                    steps: Sequence[Tuple[str, str]],
                    template_id: Optional[int] = None) -> Pipeline:
    """steps: ordered (step_name, assignee_discord_id). Step 1 becomes active."""
    if not steps:
        raise ValueError("a pipeline needs at least one step")
    now = utcnow()
    pid = conn.execute(
        "INSERT INTO pipelines(template_id, title, created_by, created_at, status) "
        "VALUES (?,?,?,?,'active')",
        (template_id, title, created_by, now),
    ).lastrowid
    for i, (step_name, assignee) in enumerate(steps, start=1):
        conn.execute(
            "INSERT INTO pipeline_steps(pipeline_id, step_order, step_name, assignee_discord_id, "
            "status, activated_at) VALUES (?,?,?,?,?,?)",
            (pid, i, step_name, assignee,
             "active" if i == 1 else "waiting",
             now if i == 1 else None),
        )
    conn.commit()
    return get_pipeline(conn, pid)  # type: ignore[return-value]


def get_pipeline(conn: sqlite3.Connection, pipeline_id: int) -> Optional[Pipeline]:
    r = conn.execute("SELECT * FROM pipelines WHERE id=?", (pipeline_id,)).fetchone()
    return Pipeline.from_row(r) if r else None


def get_pipeline_steps(conn: sqlite3.Connection, pipeline_id: int) -> List[PipelineStep]:
    return [
        PipelineStep.from_row(r)
        for r in conn.execute(
            "SELECT * FROM pipeline_steps WHERE pipeline_id=? ORDER BY step_order",
            (pipeline_id,),
        )
    ]


def get_step(conn: sqlite3.Connection, step_id: int) -> Optional[PipelineStep]:
    r = conn.execute("SELECT * FROM pipeline_steps WHERE id=?", (step_id,)).fetchone()
    return PipelineStep.from_row(r) if r else None


def active_pipelines(conn: sqlite3.Connection) -> List[Pipeline]:
    return [
        Pipeline.from_row(r)
        for r in conn.execute("SELECT * FROM pipelines WHERE status='active' ORDER BY created_at")
    ]


def active_step_of(conn: sqlite3.Connection, pipeline_id: int) -> Optional[PipelineStep]:
    r = conn.execute(
        "SELECT * FROM pipeline_steps WHERE pipeline_id=? AND status='active' "
        "ORDER BY step_order LIMIT 1",
        (pipeline_id,),
    ).fetchone()
    return PipelineStep.from_row(r) if r else None


def user_active_steps(conn: sqlite3.Connection, discord_id: str) -> List[Tuple[PipelineStep, Pipeline]]:
    """Caller's active pipeline steps, oldest activation first."""
    rows = conn.execute(
        "SELECT ps.*, p.id AS p_id FROM pipeline_steps ps "
        "JOIN pipelines p ON p.id = ps.pipeline_id "
        "WHERE ps.assignee_discord_id=? AND ps.status='active' AND p.status='active' "
        "ORDER BY ps.activated_at",
        (discord_id,),
    ).fetchall()
    out: List[Tuple[PipelineStep, Pipeline]] = []
    for r in rows:
        step = PipelineStep.from_row(r)
        pipeline = get_pipeline(conn, step.pipeline_id)
        if pipeline:
            out.append((step, pipeline))
    return out


def all_active_steps(conn: sqlite3.Connection) -> List[Tuple[PipelineStep, Pipeline]]:
    out: List[Tuple[PipelineStep, Pipeline]] = []
    for p in active_pipelines(conn):
        step = active_step_of(conn, p.id)
        if step:
            out.append((step, p))
    return out


class CompletionResult:
    """What happened when a step was completed — feeds the announcement."""

    def __init__(self, pipeline: Pipeline, completed: PipelineStep,
                 next_step: Optional[PipelineStep], total_steps: int):
        self.pipeline = pipeline
        self.completed = completed
        self.next_step = next_step          # None → pipeline finished
        self.total_steps = total_steps

    @property
    def pipeline_complete(self) -> bool:
        return self.next_step is None


def complete_step(conn: sqlite3.Connection, step_id: int, skipped: bool = False) -> Optional[CompletionResult]:
    """Mark an ACTIVE step done, promote the next waiting step (if any) to
    active, and complete the pipeline when it was the last one. Returns
    None if the step isn't active (e.g. double-click race) — callers
    treat that as a no-op rather than an error."""
    step = get_step(conn, step_id)
    if step is None or step.status != "active":
        return None
    pipeline = get_pipeline(conn, step.pipeline_id)
    if pipeline is None or pipeline.status != "active":
        return None

    now = utcnow()
    conn.execute(
        "UPDATE pipeline_steps SET status='done', completed_at=?, skipped=? WHERE id=?",
        (now, 1 if skipped else 0, step_id),
    )
    nxt_row = conn.execute(
        "SELECT * FROM pipeline_steps WHERE pipeline_id=? AND status='waiting' "
        "ORDER BY step_order LIMIT 1",
        (step.pipeline_id,),
    ).fetchone()
    next_step: Optional[PipelineStep] = None
    if nxt_row:
        conn.execute(
            "UPDATE pipeline_steps SET status='active', activated_at=? WHERE id=?",
            (now, nxt_row["id"]),
        )
        next_step = get_step(conn, nxt_row["id"])
    else:
        conn.execute("UPDATE pipelines SET status='complete' WHERE id=?", (step.pipeline_id,))
    conn.commit()

    total = conn.execute(
        "SELECT COUNT(*) FROM pipeline_steps WHERE pipeline_id=?", (step.pipeline_id,)
    ).fetchone()[0]
    completed = get_step(conn, step_id)
    pipeline = get_pipeline(conn, step.pipeline_id)
    assert completed and pipeline
    return CompletionResult(pipeline, completed, next_step, total)


def reassign_step(conn: sqlite3.Connection, step_id: int, new_assignee: str) -> Optional[PipelineStep]:
    step = get_step(conn, step_id)
    if step is None or step.status != "active":
        return None
    conn.execute(
        "UPDATE pipeline_steps SET assignee_discord_id=? WHERE id=?",
        (new_assignee, step_id),
    )
    conn.commit()
    return get_step(conn, step_id)


def cancel_pipeline(conn: sqlite3.Connection, pipeline_id: int) -> bool:
    cur = conn.execute(
        "UPDATE pipelines SET status='cancelled' WHERE id=? AND status='active'",
        (pipeline_id,),
    )
    conn.commit()
    return cur.rowcount > 0


# ── Standalone tasks ─────────────────────────────────────────────────

def add_task(conn: sqlite3.Connection, title: str, assignee: str, created_by: str,
             due_date: Optional[str] = None) -> Task:
    tid = conn.execute(
        "INSERT INTO tasks(title, assignee_discord_id, created_by, status, due_date, created_at) "
        "VALUES (?,?,?,'open',?,?)",
        (title, assignee, created_by, due_date, utcnow()),
    ).lastrowid
    conn.commit()
    r = conn.execute("SELECT * FROM tasks WHERE id=?", (tid,)).fetchone()
    return Task.from_row(r)


def get_task(conn: sqlite3.Connection, task_id: int) -> Optional[Task]:
    r = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    return Task.from_row(r) if r else None


def user_open_tasks(conn: sqlite3.Connection, discord_id: str) -> List[Task]:
    return [
        Task.from_row(r)
        for r in conn.execute(
            "SELECT * FROM tasks WHERE assignee_discord_id=? AND status='open' ORDER BY created_at",
            (discord_id,),
        )
    ]


def complete_task(conn: sqlite3.Connection, task_id: int) -> Optional[Task]:
    cur = conn.execute(
        "UPDATE tasks SET status='done', completed_at=? WHERE id=? AND status='open'",
        (utcnow(), task_id),
    )
    conn.commit()
    return get_task(conn, task_id) if cur.rowcount else None


# ── Recurring tasks ──────────────────────────────────────────────────
# A rule spawns a normal standalone task (completed via /done) once per
# cycle. Due-ness is computed against a LOCAL wall-clock datetime the
# caller passes in, so the schedule follows the team's timezone and the
# logic stays unit-testable.

def add_recurring(conn: sqlite3.Connection, title: str, assignee: str, created_by: str,
                  frequency: str, weekday: Optional[int], time_hhmm: str) -> int:
    if frequency not in ("daily", "weekly"):
        raise ValueError("frequency must be daily or weekly")
    if frequency == "weekly" and weekday is None:
        raise ValueError("weekly rules need a weekday")
    rid = conn.execute(
        "INSERT INTO recurring_tasks(title, assignee_discord_id, created_by, frequency, "
        "weekday, time_hhmm) VALUES (?,?,?,?,?,?)",
        (title, assignee, created_by, frequency, weekday, time_hhmm),
    ).lastrowid
    conn.commit()
    return rid


def list_recurring(conn: sqlite3.Connection) -> List[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM recurring_tasks WHERE active=1 ORDER BY id"
    ).fetchall()


def remove_recurring(conn: sqlite3.Connection, rule_id: int) -> bool:
    cur = conn.execute(
        "UPDATE recurring_tasks SET active=0 WHERE id=? AND active=1", (rule_id,)
    )
    conn.commit()
    return cur.rowcount > 0


def due_recurring(conn: sqlite3.Connection, now_local: datetime) -> List[sqlite3.Row]:
    """Rules that should spawn right now: correct day, past their time,
    and not already spawned today."""
    today = now_local.strftime("%Y-%m-%d")
    hhmm = now_local.strftime("%H:%M")
    out = []
    for r in list_recurring(conn):
        if r["frequency"] == "weekly" and r["weekday"] != now_local.weekday():
            continue
        if r["last_spawned_date"] == today:
            continue
        if hhmm < r["time_hhmm"]:
            continue
        out.append(r)
    return out


def spawn_recurring(conn: sqlite3.Connection, rule: sqlite3.Row, now_local: datetime) -> Task:
    """Create today's instance of a recurring rule as a normal task."""
    task = add_task(conn, rule["title"], rule["assignee_discord_id"], rule["created_by"])
    conn.execute(
        "UPDATE recurring_tasks SET last_spawned_date=? WHERE id=?",
        (now_local.strftime("%Y-%m-%d"), rule["id"]),
    )
    conn.commit()
    return task


# ── Stale-step nudges ────────────────────────────────────────────────

def stale_active_steps(conn: sqlite3.Connection, threshold_hours: int) -> List[Tuple[PipelineStep, Pipeline]]:
    """Active steps held longer than threshold, skipping ones nudged within
    the last threshold window so the 12h loop doesn't double-ping."""
    out: List[Tuple[PipelineStep, Pipeline]] = []
    now = datetime.now(timezone.utc)
    for step, pipeline in all_active_steps(conn):
        if not step.activated_at:
            continue
        held = (now - datetime.fromisoformat(step.activated_at)).total_seconds() / 3600
        if held < threshold_hours:
            continue
        row = conn.execute(
            "SELECT last_nudged_at FROM pipeline_steps WHERE id=?", (step.id,)
        ).fetchone()
        if row and row["last_nudged_at"]:
            since = (now - datetime.fromisoformat(row["last_nudged_at"])).total_seconds() / 3600
            if since < threshold_hours:
                continue
        out.append((step, pipeline))
    return out


def mark_nudged(conn: sqlite3.Connection, step_id: int) -> None:
    conn.execute("UPDATE pipeline_steps SET last_nudged_at=? WHERE id=?", (utcnow(), step_id))
    conn.commit()
