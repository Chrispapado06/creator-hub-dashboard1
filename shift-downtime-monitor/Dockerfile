# Dockerfile for Railway deploy of the Shift Downtime Monitor.
# Build context = REPO ROOT (set in railway.json → "buildContext": "."),
# so we can copy both shift-downtime-monitor/ AND payout-bot/config.mjs
# (which monitor.mjs imports from).

FROM node:22-slim
WORKDIR /app

# Only copy what the monitor needs at runtime.
COPY shift-downtime-monitor/ ./shift-downtime-monitor/
COPY payout-bot/config.mjs   ./payout-bot/config.mjs
COPY payout-bot/package.json ./payout-bot/package.json

WORKDIR /app/shift-downtime-monitor
RUN npm install --no-package-lock --omit=dev

# Always-on mode — outer forever-loop in monitor.mjs.
ENV RAILWAY_MODE=1
# Persist state files on a mounted volume (see railway.json: "mounts").
ENV STATE_DIR=/data
RUN mkdir -p /data

CMD ["node", "monitor.mjs"]
