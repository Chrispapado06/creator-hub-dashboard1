#!/usr/bin/env python3
"""TaskFlow — pipeline task-handoff bot for a small agency team.

Run:  python3 bot.py   (reads DISCORD_TOKEN from .env)
Set GUILD_ID in .env for instant slash-command sync to one server;
without it commands sync globally (Discord may take up to an hour).
"""
from __future__ import annotations

import asyncio
import logging
import os

import discord
from discord.ext import commands
from dotenv import load_dotenv

load_dotenv()
TOKEN = os.getenv("DISCORD_TOKEN")
GUILD_ID = os.getenv("GUILD_ID")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("taskflow")


class TaskFlowBot(commands.Bot):
    def __init__(self):
        # Default (non-privileged) intents are enough: we only use slash
        # commands, embeds and <@id> mentions — no message content needed.
        super().__init__(command_prefix="!tf-unused-", intents=discord.Intents.default(),
                         allowed_mentions=discord.AllowedMentions(
                             users=True, roles=False, everyone=False))

    async def setup_hook(self) -> None:
        await self.load_extension("cogs.tasks")
        if GUILD_ID:
            guild = discord.Object(id=int(GUILD_ID))
            self.tree.copy_global_to(guild=guild)
            synced = await self.tree.sync(guild=guild)
            log.info("Synced %d commands to guild %s (instant)", len(synced), GUILD_ID)
        else:
            synced = await self.tree.sync()
            log.info("Synced %d commands globally (may take up to 1h to appear)", len(synced))

    async def on_ready(self) -> None:
        log.info("Logged in as %s (%s) — TaskFlow is up", self.user, self.user.id)


def main() -> None:
    if not TOKEN:
        raise SystemExit("DISCORD_TOKEN missing — copy .env.example to .env and fill it in.")
    asyncio.run(TaskFlowBot().start(TOKEN))


if __name__ == "__main__":
    main()
