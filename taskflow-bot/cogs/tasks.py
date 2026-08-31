# All TaskFlow slash commands. The cog never touches SQL directly —
# every mutation goes through db.py, so the bot can be killed at any
# moment and restart with full state.
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Awaitable, Callable, Dict, List, Optional, Tuple

import discord
from discord import app_commands
from discord.ext import commands, tasks

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import db
from models import Pipeline, PipelineStep

MAX_SELECT = 25          # Discord's hard cap on select-menu options
DEFAULT_NUDGE_HOURS = 48
DEFAULT_TZ = "Europe/London"   # recurring tasks fire on this wall clock
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def trunc(s: str, n: int = 80) -> str:
    return s if len(s) <= n else s[: n - 1] + "…"


def held_for(iso: Optional[str]) -> str:
    """'⏳ 2d' style age of an active step."""
    if not iso:
        return "⏳ ?"
    secs = (datetime.now(timezone.utc) - datetime.fromisoformat(iso)).total_seconds()
    if secs < 3600:
        return f"⏳ {max(1, int(secs // 60))}m"
    if secs < 48 * 3600:
        return f"⏳ {int(secs // 3600)}h"
    return f"⏳ {int(secs // 86400)}d"


def is_admin(interaction: discord.Interaction) -> bool:
    perms = getattr(interaction.user, "guild_permissions", None)
    return bool(perms and perms.manage_guild)


class TaskFlow(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self.conn = db.get_conn()
        db.init_db(self.conn)

    async def cog_load(self) -> None:
        self.nudge_loop.start()
        self.recurring_loop.start()

    async def cog_unload(self) -> None:
        self.nudge_loop.cancel()
        self.recurring_loop.cancel()
        self.conn.close()

    # ── Shared helpers ───────────────────────────────────────────────

    async def task_channel(self, interaction: discord.Interaction) -> Tuple[Optional[discord.abc.Messageable], bool]:
        """(channel, configured). Falls back to the invoking channel so the
        bot is useful before /setup channel has been run."""
        cid = db.get_config(self.conn, "task_channel_id")
        if cid:
            ch = self.bot.get_channel(int(cid))
            if ch:
                return ch, True
        return interaction.channel, False

    def chain_lines(self, pipeline: Pipeline) -> str:
        lines = []
        for s in db.get_pipeline_steps(self.conn, pipeline.id):
            icon = {"done": "✅", "active": "▶️", "waiting": "⏳"}[s.status]
            note = " *(skipped)*" if s.skipped else ""
            lines.append(f"{icon} {s.step_order}. {s.step_name} — <@{s.assignee_discord_id}>{note}")
        return "\n".join(lines)

    def pipeline_embed(self, pipeline: Pipeline, headline: str) -> discord.Embed:
        e = discord.Embed(title=trunc(pipeline.title, 200), description=headline, color=0x5865F2)
        e.add_field(name="Chain", value=self.chain_lines(pipeline), inline=False)
        e.set_footer(text=f"pipeline #{pipeline.id}")
        return e

    async def announce(self, interaction: discord.Interaction, content: str, embed: discord.Embed) -> bool:
        ch, configured = await self.task_channel(interaction)
        if ch is None:
            return False
        if not configured:
            embed.set_footer(text=f"{embed.footer.text} · tip: /setup channel to pick a task channel")
        await ch.send(content, embed=embed,
                      allowed_mentions=discord.AllowedMentions(users=True))
        return True

    async def _complete_and_announce(self, interaction: discord.Interaction,
                                     step_id: int, skipped: bool = False) -> str:
        """Complete a step, post the handoff/complete message, return the
        ephemeral ack text for the actor."""
        result = db.complete_step(self.conn, step_id, skipped=skipped)
        if result is None:
            return "That step was already completed (or the pipeline is no longer active)."
        actor = interaction.user.id
        verb = "skipped" if skipped else "handed off"
        if result.pipeline_complete:
            headline = f"✅ **{trunc(result.pipeline.title, 150)}** — all {result.total_steps} steps done!"
            embed = self.pipeline_embed(result.pipeline, headline)
            await self.announce(interaction, "✅ Pipeline complete", embed)
            return f"Pipeline **{trunc(result.pipeline.title)}** is complete 🎉"
        nxt = result.next_step
        assert nxt is not None
        headline = (
            f"🔁 **{trunc(result.pipeline.title, 120)}** | "
            f"Step {nxt.step_order}/{result.total_steps}: **{trunc(nxt.step_name, 80)}** "
            f"→ <@{nxt.assignee_discord_id}> ({verb} by <@{actor}>)"
        )
        embed = self.pipeline_embed(result.pipeline, headline)
        await self.announce(interaction, f"<@{nxt.assignee_discord_id}>", embed)
        return (f"Done ✅ — **{trunc(nxt.step_name)}** is now with "
                f"<@{nxt.assignee_discord_id}>.")

    # ── /setup (admin) ───────────────────────────────────────────────

    setup_grp = app_commands.Group(
        name="setup", description="TaskFlow admin setup",
        default_permissions=discord.Permissions(manage_guild=True),
    )

    @setup_grp.command(name="channel", description="Set the channel for pipeline pings and updates")
    async def setup_channel(self, interaction: discord.Interaction, channel: discord.TextChannel):
        if not is_admin(interaction):
            return await interaction.response.send_message("Manage Server permission required.", ephemeral=True)
        db.set_config(self.conn, "task_channel_id", str(channel.id))
        await interaction.response.send_message(f"Task channel set to {channel.mention} ✅", ephemeral=True)

    @setup_grp.command(name="member", description="Register a team member")
    @app_commands.describe(user="The team member", role_name="e.g. scriptwriter / uploader / qa")
    async def setup_member(self, interaction: discord.Interaction, user: discord.User, role_name: str):
        if not is_admin(interaction):
            return await interaction.response.send_message("Manage Server permission required.", ephemeral=True)
        db.upsert_user(self.conn, str(user.id), user.display_name, role_name.strip())
        await interaction.response.send_message(
            f"Registered **{user.display_name}** as *{trunc(role_name, 40)}* ✅", ephemeral=True)

    @setup_grp.command(name="nudge", description="Hours an active step may sit before a nudge (default 48)")
    async def setup_nudge(self, interaction: discord.Interaction, hours: app_commands.Range[int, 1, 720]):
        if not is_admin(interaction):
            return await interaction.response.send_message("Manage Server permission required.", ephemeral=True)
        db.set_config(self.conn, "nudge_hours", str(hours))
        await interaction.response.send_message(f"Stale-step nudge threshold set to **{hours}h** ✅", ephemeral=True)

    # ── /template (admin) ────────────────────────────────────────────

    template_grp = app_commands.Group(
        name="template", description="Manage pipeline templates",
        default_permissions=discord.Permissions(manage_guild=True),
    )

    @template_grp.command(name="create", description="Create a pipeline template")
    @app_commands.describe(name="Template name (must be unique)")
    async def template_create(self, interaction: discord.Interaction, name: str):
        if not is_admin(interaction):
            return await interaction.response.send_message("Manage Server permission required.", ephemeral=True)
        name = name.strip()
        if db.get_template_by_name(self.conn, name):
            return await interaction.response.send_message(
                f"A template called **{trunc(name)}** already exists.", ephemeral=True)
        await interaction.response.send_modal(TemplateModal(self, name))

    @template_grp.command(name="list", description="List all templates and their steps")
    async def template_list(self, interaction: discord.Interaction):
        tpls = db.list_templates(self.conn)
        e = discord.Embed(title="Templates", color=0x5865F2)
        if not tpls:
            e.description = "No templates yet — `/template create` to add one."
        for t in tpls[:25]:
            steps = db.get_template_steps(self.conn, t.id)
            lines = []
            for s in steps:
                who = f" — <@{s.default_assignee_discord_id}>" if s.default_assignee_discord_id else ""
                lines.append(f"{s.step_order}. {s.step_name}{who}")
            e.add_field(name=trunc(t.name, 60), value="\n".join(lines) or "*no steps*", inline=False)
        await interaction.response.send_message(embed=e, ephemeral=True)

    @template_grp.command(name="delete", description="Delete a template (existing pipelines keep running)")
    async def template_delete(self, interaction: discord.Interaction, name: str):
        if not is_admin(interaction):
            return await interaction.response.send_message("Manage Server permission required.", ephemeral=True)
        ok = db.delete_template(self.conn, name)
        await interaction.response.send_message(
            f"Template **{trunc(name)}** deleted ✅" if ok else f"No template called **{trunc(name)}**.",
            ephemeral=True)

    @template_delete.autocomplete("name")
    async def _tpl_name_ac(self, interaction: discord.Interaction, current: str):
        try:
            return [app_commands.Choice(name=t.name, value=t.name)
                    for t in db.list_templates(self.conn)
                    if current.lower() in t.name.lower()][:MAX_SELECT]
        except Exception:
            return []

    # ── /start ───────────────────────────────────────────────────────

    @app_commands.command(name="start", description="Start a pipeline from a template")
    @app_commands.describe(template="Which template", title='e.g. "Script — Marissa promo July"')
    async def start(self, interaction: discord.Interaction, template: str, title: str):
        tpl = db.get_template_by_name(self.conn, template)
        if tpl is None:
            return await interaction.response.send_message(
                f"No template called **{trunc(template)}** — try `/template list`.", ephemeral=True)
        tsteps = db.get_template_steps(self.conn, tpl.id)
        if not tsteps:
            return await interaction.response.send_message(
                f"Template **{tpl.name}** has no steps.", ephemeral=True)

        assignees: List[Optional[str]] = [s.default_assignee_discord_id for s in tsteps]
        missing = [(i, tsteps[i].step_name) for i, a in enumerate(assignees) if not a]

        async def launch(final_inter: discord.Interaction, mapping: Dict[int, str]):
            for idx, uid in mapping.items():
                assignees[idx] = uid
            pipeline = db.create_pipeline(
                self.conn, title.strip(), str(interaction.user.id),
                [(s.step_name, a) for s, a in zip(tsteps, assignees)],  # type: ignore[arg-type]
                template_id=tpl.id,
            )
            first = db.active_step_of(self.conn, pipeline.id)
            assert first is not None
            headline = (f"🚀 **{trunc(pipeline.title, 120)}** | "
                        f"Step 1/{len(tsteps)}: **{trunc(first.step_name, 80)}** "
                        f"→ <@{first.assignee_discord_id}> (started by <@{interaction.user.id}>)")
            await self.announce(interaction, f"<@{first.assignee_discord_id}>",
                                self.pipeline_embed(pipeline, headline))
            msg = f"Pipeline **{trunc(pipeline.title)}** started ✅ (#{pipeline.id})"
            if final_inter.response.is_done():
                await final_inter.edit_original_response(content=msg, view=None)
            else:
                await final_inter.response.send_message(msg, ephemeral=True)

        if not missing:
            return await launch(interaction, {})
        view = AssigneePicker(missing, launch, allow_skip=False)
        await interaction.response.send_message(
            f"**{tpl.name}** has {len(missing)} step(s) with no default assignee.\n"
            f"{view.prompt_text()}",
            view=view, ephemeral=True)

    @start.autocomplete("template")
    async def _start_tpl_ac(self, interaction: discord.Interaction, current: str):
        try:
            return [app_commands.Choice(name=t.name, value=t.name)
                    for t in db.list_templates(self.conn)
                    if current.lower() in t.name.lower()][:MAX_SELECT]
        except Exception:
            return []

    # ── /done ────────────────────────────────────────────────────────

    @app_commands.command(name="done", description="Complete your current step (or standalone task)")
    async def done(self, interaction: discord.Interaction):
        uid = str(interaction.user.id)
        steps = db.user_active_steps(self.conn, uid)
        open_tasks = db.user_open_tasks(self.conn, uid)
        total = len(steps) + len(open_tasks)
        if total == 0:
            return await interaction.response.send_message(
                "Nothing on your list — you're all clear 🎉", ephemeral=True)
        if total == 1:
            if steps:
                await interaction.response.defer(ephemeral=True)
                ack = await self._complete_and_announce(interaction, steps[0][0].id)
                return await interaction.followup.send(ack, ephemeral=True)
            t = db.complete_task(self.conn, open_tasks[0].id)
            return await interaction.response.send_message(
                f"Task **{trunc(t.title)}** done ✅" if t else "Task was already completed.",
                ephemeral=True)

        options: List[discord.SelectOption] = []
        for step, pipeline in steps[:MAX_SELECT]:
            options.append(discord.SelectOption(
                label=trunc(f"{pipeline.title}", 95),
                description=trunc(f"Step {step.step_order}: {step.step_name}", 95),
                value=f"s:{step.id}", emoji="🔁"))
        for t in open_tasks[: MAX_SELECT - len(options)]:
            options.append(discord.SelectOption(
                label=trunc(t.title, 95),
                description=f"standalone task{f' · due {t.due_date}' if t.due_date else ''}",
                value=f"t:{t.id}", emoji="📋"))

        view = DonePicker(self, options)
        await interaction.response.send_message(
            f"You have **{total}** open items — which one is done?", view=view, ephemeral=True)

    # ── /mytasks & /tasks ────────────────────────────────────────────

    def _list_embed(self, uid: str, label: str) -> discord.Embed:
        steps = db.user_active_steps(self.conn, uid)
        open_tasks = db.user_open_tasks(self.conn, uid)
        e = discord.Embed(title=f"Open items — {label}", color=0x57F287)
        if not steps and not open_tasks:
            e.description = "Nothing open — all clear ✅ (if it's not on the list, it's done)"
            return e
        e.color = 0x5865F2
        shown = 0
        for step, pipeline in steps:
            if shown >= 24:
                break
            total = len(db.get_pipeline_steps(self.conn, pipeline.id))
            e.add_field(
                name=f"🔁 {trunc(pipeline.title, 60)}",
                value=(f"Step {step.step_order}/{total}: **{trunc(step.step_name, 60)}** "
                       f"· holding {held_for(step.activated_at)}"),
                inline=False)
            shown += 1
        for t in open_tasks:
            if shown >= 24:
                break
            due = f" · due **{t.due_date}**" if t.due_date else ""
            e.add_field(name=f"📋 {trunc(t.title, 60)}",
                        value=f"standalone · from <@{t.created_by}>{due}", inline=False)
            shown += 1
        rest = len(steps) + len(open_tasks) - shown
        if rest > 0:
            e.add_field(name="…", value=f"and {rest} more", inline=False)
        return e

    @app_commands.command(name="mytasks", description="Your open pipeline steps and tasks")
    async def mytasks(self, interaction: discord.Interaction):
        await interaction.response.send_message(
            embed=self._list_embed(str(interaction.user.id), interaction.user.display_name),
            ephemeral=True)

    @app_commands.command(name="tasks", description="See someone's open items — if it's not listed, it's done")
    async def tasks_of(self, interaction: discord.Interaction, user: discord.User):
        await interaction.response.send_message(
            embed=self._list_embed(str(user.id), user.display_name), ephemeral=True)

    # ── /task add ────────────────────────────────────────────────────

    task_grp = app_commands.Group(name="task", description="Standalone tasks (no chain)")

    @task_grp.command(name="add", description="Assign a standalone task (no pipeline)")
    @app_commands.describe(user="Who does it", title="What needs doing", due="Optional due date YYYY-MM-DD")
    async def task_add(self, interaction: discord.Interaction, user: discord.User,
                       title: str, due: Optional[str] = None):
        if due:
            try:
                datetime.strptime(due, "%Y-%m-%d")
            except ValueError:
                return await interaction.response.send_message(
                    "Due date must be `YYYY-MM-DD` (e.g. 2026-07-01).", ephemeral=True)
        t = db.add_task(self.conn, title.strip(), str(user.id), str(interaction.user.id), due)
        e = discord.Embed(
            description=(f"📋 New task for <@{user.id}>: **{trunc(t.title, 150)}**"
                         f"{f' · due **{due}**' if due else ''} (from <@{interaction.user.id}>)"),
            color=0xFEE75C)
        e.set_footer(text=f"task #{t.id}")
        await interaction.response.send_message(f"Task assigned to {user.display_name} ✅", ephemeral=True)
        await self.announce(interaction, f"<@{user.id}>", e)

    # ── /board ───────────────────────────────────────────────────────

    @app_commands.command(name="board", description="All active pipelines and who's holding them")
    async def board(self, interaction: discord.Interaction):
        rows = db.all_active_steps(self.conn)
        e = discord.Embed(title="Pipeline board", color=0x5865F2)
        if not rows:
            e.description = "No active pipelines 🎉"
        for step, pipeline in rows[:25]:
            total = len(db.get_pipeline_steps(self.conn, pipeline.id))
            e.add_field(
                name=f"#{pipeline.id} {trunc(pipeline.title, 55)}",
                value=(f"Step {step.step_order}/{total}: **{trunc(step.step_name, 60)}** — "
                       f"<@{step.assignee_discord_id}> {held_for(step.activated_at)}"),
                inline=False)
        await interaction.response.send_message(embed=e, ephemeral=True)

    # ── /cancel ──────────────────────────────────────────────────────

    @app_commands.command(name="cancel", description="Cancel a pipeline (creator or admin only)")
    async def cancel(self, interaction: discord.Interaction, pipeline: str):
        try:
            pid = int(pipeline)
        except ValueError:
            return await interaction.response.send_message("Pick a pipeline from the list.", ephemeral=True)
        p = db.get_pipeline(self.conn, pid)
        if p is None or p.status != "active":
            return await interaction.response.send_message("That pipeline isn't active.", ephemeral=True)
        if str(interaction.user.id) != p.created_by and not is_admin(interaction):
            return await interaction.response.send_message(
                "Only the pipeline's creator or an admin can cancel it.", ephemeral=True)
        db.cancel_pipeline(self.conn, pid)
        e = discord.Embed(
            description=f"🛑 **{trunc(p.title, 150)}** cancelled by <@{interaction.user.id}>",
            color=0xED4245)
        e.set_footer(text=f"pipeline #{p.id}")
        await interaction.response.send_message(f"Pipeline **{trunc(p.title)}** cancelled ✅", ephemeral=True)
        await self.announce(interaction, "", e)

    @cancel.autocomplete("pipeline")
    async def _cancel_ac(self, interaction: discord.Interaction, current: str):
        try:
            return [app_commands.Choice(name=trunc(f"#{p.id} {p.title}", 95), value=str(p.id))
                    for p in db.active_pipelines(self.conn)
                    if current.lower() in p.title.lower() or current == str(p.id)][:MAX_SELECT]
        except Exception:
            return []

    # ── /reassign ────────────────────────────────────────────────────

    @app_commands.command(name="reassign", description="Hand an active step to someone else")
    @app_commands.describe(step="Which active step", user="New assignee")
    async def reassign(self, interaction: discord.Interaction, step: str, user: discord.User):
        try:
            sid = int(step)
        except ValueError:
            return await interaction.response.send_message("Pick a step from the list.", ephemeral=True)
        old = db.get_step(self.conn, sid)
        if old is None or old.status != "active":
            return await interaction.response.send_message("That step isn't active.", ephemeral=True)
        new = db.reassign_step(self.conn, sid, str(user.id))
        assert new is not None
        p = db.get_pipeline(self.conn, new.pipeline_id)
        assert p is not None
        e = discord.Embed(
            description=(f"👉 **{trunc(p.title, 120)}** — step **{trunc(new.step_name, 80)}** "
                         f"reassigned to <@{user.id}> "
                         f"(was <@{old.assignee_discord_id}>, by <@{interaction.user.id}>)"),
            color=0xFEE75C)
        e.set_footer(text=f"pipeline #{p.id}")
        await interaction.response.send_message("Reassigned ✅", ephemeral=True)
        await self.announce(interaction, f"<@{user.id}>", e)

    @reassign.autocomplete("step")
    async def _reassign_ac(self, interaction: discord.Interaction, current: str):
        return self._active_step_choices(current)

    # ── /skip ────────────────────────────────────────────────────────

    @app_commands.command(name="skip", description="Skip an active step (admin or its assignee)")
    async def skip(self, interaction: discord.Interaction, step: str):
        try:
            sid = int(step)
        except ValueError:
            return await interaction.response.send_message("Pick a step from the list.", ephemeral=True)
        s = db.get_step(self.conn, sid)
        if s is None or s.status != "active":
            return await interaction.response.send_message("That step isn't active.", ephemeral=True)
        if str(interaction.user.id) != s.assignee_discord_id and not is_admin(interaction):
            return await interaction.response.send_message(
                "Only the step's assignee or an admin can skip it.", ephemeral=True)
        await interaction.response.defer(ephemeral=True)
        ack = await self._complete_and_announce(interaction, sid, skipped=True)
        await interaction.followup.send(ack, ephemeral=True)

    @skip.autocomplete("step")
    async def _skip_ac(self, interaction: discord.Interaction, current: str):
        return self._active_step_choices(current)

    def _active_step_choices(self, current: str) -> List[app_commands.Choice]:
        try:
            out = []
            for step, pipeline in db.all_active_steps(self.conn):
                holder = db.display_name(self.conn, step.assignee_discord_id)
                label = trunc(f"#{pipeline.id} {pipeline.title} — {step.step_name} ({holder})", 95)
                if current.lower() in label.lower():
                    out.append(app_commands.Choice(name=label, value=str(step.id)))
            return out[:MAX_SELECT]
        except Exception:
            return []

    # ── /recurring ───────────────────────────────────────────────────

    recurring_grp = app_commands.Group(name="recurring",
                                       description="Tasks that repeat on a schedule")

    @recurring_grp.command(name="add", description="Create a repeating task (daily or weekly)")
    @app_commands.describe(
        user="Who it gets assigned to each time",
        title="What needs doing",
        every="How often it repeats",
        weekday="Which day (weekly only)",
        time="Local time it appears, HH:MM 24h (default 09:00)")
    @app_commands.choices(
        every=[app_commands.Choice(name="daily", value="daily"),
               app_commands.Choice(name="weekly", value="weekly")],
        weekday=[app_commands.Choice(name=d, value=i) for i, d in enumerate(WEEKDAYS)])
    async def recurring_add(self, interaction: discord.Interaction, user: discord.User,
                            title: str, every: app_commands.Choice[str],
                            weekday: Optional[app_commands.Choice[int]] = None,
                            time: Optional[str] = None):
        if every.value == "weekly" and weekday is None:
            return await interaction.response.send_message(
                "Weekly tasks need a **weekday** — pick one.", ephemeral=True)
        hhmm = (time or "09:00").strip()
        try:
            datetime.strptime(hhmm, "%H:%M")
        except ValueError:
            return await interaction.response.send_message(
                "Time must be `HH:MM` 24-hour, e.g. `09:00` or `17:30`.", ephemeral=True)
        rid = db.add_recurring(self.conn, title.strip(), str(user.id),
                               str(interaction.user.id), every.value,
                               weekday.value if weekday else None, hhmm)
        when = (f"every day at {hhmm}" if every.value == "daily"
                else f"every {WEEKDAYS[weekday.value]} at {hhmm}")
        await interaction.response.send_message(
            f"🔄 Recurring task **#{rid}** created: **{trunc(title)}** → "
            f"{user.display_name}, {when} ✅", ephemeral=True)

    @recurring_grp.command(name="list", description="All recurring task rules")
    async def recurring_list(self, interaction: discord.Interaction):
        rules = db.list_recurring(self.conn)
        e = discord.Embed(title="Recurring tasks", color=0x5865F2)
        if not rules:
            e.description = "None yet — `/recurring add` to create one."
        for r in rules[:25]:
            when = (f"daily at {r['time_hhmm']}" if r["frequency"] == "daily"
                    else f"every {WEEKDAYS[r['weekday']]} at {r['time_hhmm']}")
            e.add_field(name=f"#{r['id']} {trunc(r['title'], 60)}",
                        value=f"→ <@{r['assignee_discord_id']}> · {when}",
                        inline=False)
        await interaction.response.send_message(embed=e, ephemeral=True)

    @recurring_grp.command(name="remove", description="Stop a recurring task")
    async def recurring_remove(self, interaction: discord.Interaction, rule: str):
        try:
            rid = int(rule)
        except ValueError:
            return await interaction.response.send_message("Pick a rule from the list.", ephemeral=True)
        ok = db.remove_recurring(self.conn, rid)
        await interaction.response.send_message(
            f"Recurring task #{rid} stopped ✅ (already-spawned copies stay on lists)"
            if ok else "That rule doesn't exist or is already stopped.", ephemeral=True)

    @recurring_remove.autocomplete("rule")
    async def _recurring_ac(self, interaction: discord.Interaction, current: str):
        try:
            out = []
            for r in db.list_recurring(self.conn):
                who = db.display_name(self.conn, r["assignee_discord_id"])
                label = trunc(f"#{r['id']} {r['title']} → {who}", 95)
                if current.lower() in label.lower():
                    out.append(app_commands.Choice(name=label, value=str(r["id"])))
            return out[:MAX_SELECT]
        except Exception:
            return []

    @tasks.loop(minutes=15)
    async def recurring_loop(self):
        try:
            from zoneinfo import ZoneInfo
            tz = ZoneInfo(db.get_config(self.conn, "timezone", DEFAULT_TZ))
        except Exception:
            tz = timezone.utc
        now_local = datetime.now(tz).replace(tzinfo=None)
        due = db.due_recurring(self.conn, now_local)
        if not due:
            return
        cid = db.get_config(self.conn, "task_channel_id")
        channel = self.bot.get_channel(int(cid)) if cid else None
        for rule in due:
            task = db.spawn_recurring(self.conn, rule, now_local)
            if channel is None:
                continue
            e = discord.Embed(
                description=(f"🔄 Recurring task for <@{task.assignee_discord_id}>: "
                             f"**{trunc(task.title, 150)}** — `/done` when finished"),
                color=0xFEE75C)
            e.set_footer(text=f"task #{task.id} · rule #{rule['id']}")
            await channel.send(f"<@{task.assignee_discord_id}>", embed=e,
                               allowed_mentions=discord.AllowedMentions(users=True))

    @recurring_loop.before_loop
    async def _wait_ready_recurring(self):
        await self.bot.wait_until_ready()

    # ── Stale-step nudges ────────────────────────────────────────────

    @tasks.loop(hours=12)
    async def nudge_loop(self):
        cid = db.get_config(self.conn, "task_channel_id")
        if not cid:
            return
        channel = self.bot.get_channel(int(cid))
        if channel is None:
            return
        hours = int(db.get_config(self.conn, "nudge_hours", str(DEFAULT_NUDGE_HOURS)))
        for step, pipeline in db.stale_active_steps(self.conn, hours):
            total = len(db.get_pipeline_steps(self.conn, pipeline.id))
            e = discord.Embed(
                description=(f"👋 Gentle nudge — **{trunc(pipeline.title, 120)}** "
                             f"(step {step.step_order}/{total}: **{trunc(step.step_name, 80)}**) "
                             f"has been with <@{step.assignee_discord_id}> for "
                             f"{held_for(step.activated_at)[2:]}."),
                color=0xFEE75C)
            e.set_footer(text=f"pipeline #{pipeline.id} · /done when finished, /reassign to hand off")
            await channel.send(f"<@{step.assignee_discord_id}>", embed=e,
                               allowed_mentions=discord.AllowedMentions(users=True))
            db.mark_nudged(self.conn, step.id)

    @nudge_loop.before_loop
    async def _wait_ready(self):
        await self.bot.wait_until_ready()


# ── Interactive views ───────────────────────────────────────────────

class DonePicker(discord.ui.View):
    """Select menu shown by /done when the caller has several open items."""

    def __init__(self, cog: TaskFlow, options: List[discord.SelectOption]):
        super().__init__(timeout=300)
        self.cog = cog
        sel = discord.ui.Select(placeholder="Pick the item you finished…", options=options)
        sel.callback = self._picked  # type: ignore[assignment]
        self._select = sel
        self.add_item(sel)

    async def _picked(self, interaction: discord.Interaction):
        kind, _, raw = self._select.values[0].partition(":")
        if kind == "t":
            t = db.complete_task(self.cog.conn, int(raw))
            msg = f"Task **{trunc(t.title)}** done ✅" if t else "Task was already completed."
            return await interaction.response.edit_message(content=msg, view=None)
        await interaction.response.defer()
        ack = await self.cog._complete_and_announce(interaction, int(raw))
        await interaction.edit_original_response(content=ack, view=None)


class AssigneePicker(discord.ui.View):
    """Walks through steps that need an assignee, one UserSelect at a time.
    Used by /start (skip not allowed) and /template create (skip allowed,
    meaning 'no default — ask at /start time')."""

    def __init__(self, missing: List[Tuple[int, str]],
                 on_finish: Callable[[discord.Interaction, Dict[int, str]], Awaitable[None]],
                 allow_skip: bool):
        super().__init__(timeout=600)
        self.missing = missing
        self.on_finish = on_finish
        self.allow_skip = allow_skip
        self.pos = 0
        self.mapping: Dict[int, str] = {}
        self._build()

    def prompt_text(self) -> str:
        idx, name = self.missing[self.pos]
        return f"**{self.pos + 1}/{len(self.missing)}** — who does step {idx + 1}: **{trunc(name, 60)}**?"

    def _build(self):
        self.clear_items()
        sel = discord.ui.UserSelect(placeholder="Pick a person…")
        sel.callback = self._picked  # type: ignore[assignment]
        self._select = sel
        self.add_item(sel)
        if self.allow_skip:
            btn = discord.ui.Button(label="No default (ask at /start)", style=discord.ButtonStyle.secondary)
            btn.callback = self._skipped  # type: ignore[assignment]
            self.add_item(btn)

    async def _advance(self, interaction: discord.Interaction):
        self.pos += 1
        if self.pos >= len(self.missing):
            self.stop()
            return await self.on_finish(interaction, self.mapping)
        self._build()
        await interaction.response.edit_message(content=self.prompt_text(), view=self)

    async def _picked(self, interaction: discord.Interaction):
        idx, _ = self.missing[self.pos]
        self.mapping[idx] = str(self._select.values[0].id)
        await self._advance(interaction)

    async def _skipped(self, interaction: discord.Interaction):
        await self._advance(interaction)


class TemplateModal(discord.ui.Modal):
    """Collects description + step names; default assignees are picked
    right after via AssigneePicker (modals can't contain user selects)."""

    description_in = discord.ui.TextInput(
        label="Description (optional)", style=discord.TextStyle.short,
        required=False, max_length=200)
    steps_in = discord.ui.TextInput(
        label="Steps — one per line, in order", style=discord.TextStyle.paragraph,
        placeholder="Write script\nUpload script\nVerify upload", max_length=1000)

    def __init__(self, cog: TaskFlow, name: str):
        super().__init__(title=trunc(f"New template: {name}", 45))
        self.cog = cog
        self.name = name

    async def on_submit(self, interaction: discord.Interaction):
        steps = [ln.strip() for ln in str(self.steps_in.value).splitlines() if ln.strip()]
        if not steps:
            return await interaction.response.send_message("At least one step is required.", ephemeral=True)
        if len(steps) > 20:
            return await interaction.response.send_message("Max 20 steps per template.", ephemeral=True)
        desc = str(self.description_in.value or "").strip()

        async def finish(final_inter: discord.Interaction, mapping: Dict[int, str]):
            db.create_template(self.cog.conn, self.name, desc,
                               [(s, mapping.get(i)) for i, s in enumerate(steps)])
            lines = "\n".join(
                f"{i + 1}. {s}" + (f" — <@{mapping[i]}>" if i in mapping else "")
                for i, s in enumerate(steps))
            msg = f"Template **{trunc(self.name)}** created ✅\n{lines}"
            if final_inter.response.is_done():
                await final_inter.edit_original_response(content=msg, view=None)
            else:
                await final_inter.response.send_message(msg, ephemeral=True)

        view = AssigneePicker([(i, s) for i, s in enumerate(steps)], finish, allow_skip=True)
        await interaction.response.send_message(
            f"Now set default assignees for **{self.name}** (or skip any).\n{view.prompt_text()}",
            view=view, ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(TaskFlow(bot))
