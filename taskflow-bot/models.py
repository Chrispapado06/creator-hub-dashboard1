# Lightweight typed views over sqlite3 rows. No ORM — each dataclass
# mirrors one table and is built via from_row(). Keep these dumb: all
# state changes go through db.py so there is exactly one write path.
from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import Optional


@dataclass
class User:
    discord_id: str
    display_name: str
    role_name: str

    @classmethod
    def from_row(cls, r: sqlite3.Row) -> "User":
        return cls(r["discord_id"], r["display_name"], r["role_name"])


@dataclass
class Template:
    id: int
    name: str
    description: str

    @classmethod
    def from_row(cls, r: sqlite3.Row) -> "Template":
        return cls(r["id"], r["name"], r["description"])


@dataclass
class TemplateStep:
    id: int
    template_id: int
    step_order: int
    step_name: str
    default_assignee_discord_id: Optional[str]

    @classmethod
    def from_row(cls, r: sqlite3.Row) -> "TemplateStep":
        return cls(
            r["id"], r["template_id"], r["step_order"], r["step_name"],
            r["default_assignee_discord_id"],
        )


@dataclass
class Pipeline:
    id: int
    template_id: Optional[int]
    title: str
    created_by: str
    created_at: str
    status: str  # active | complete | cancelled

    @classmethod
    def from_row(cls, r: sqlite3.Row) -> "Pipeline":
        return cls(
            r["id"], r["template_id"], r["title"], r["created_by"],
            r["created_at"], r["status"],
        )


@dataclass
class PipelineStep:
    id: int
    pipeline_id: int
    step_order: int
    step_name: str
    assignee_discord_id: str
    status: str  # waiting | active | done
    activated_at: Optional[str]
    completed_at: Optional[str]
    skipped: bool

    @classmethod
    def from_row(cls, r: sqlite3.Row) -> "PipelineStep":
        return cls(
            r["id"], r["pipeline_id"], r["step_order"], r["step_name"],
            r["assignee_discord_id"], r["status"], r["activated_at"],
            r["completed_at"], bool(r["skipped"]),
        )


@dataclass
class Task:
    id: int
    title: str
    assignee_discord_id: str
    created_by: str
    status: str  # open | done
    due_date: Optional[str]
    created_at: str
    completed_at: Optional[str]

    @classmethod
    def from_row(cls, r: sqlite3.Row) -> "Task":
        return cls(
            r["id"], r["title"], r["assignee_discord_id"], r["created_by"],
            r["status"], r["due_date"], r["created_at"], r["completed_at"],
        )
