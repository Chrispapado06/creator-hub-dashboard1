# OFM Workspace

A Notion-style **desktop app** for running an OnlyFans Management (OFM) agency — flexible pages made of blocks, plus databases with multiple views, pre-built for agency workflows (creators, content calendar, chatter shifts & handoffs, SOP wiki, tasks, revenue, templates, team chat). The whole team works from one shared, cloud-synced workspace.

Built as a native macOS app with **Tauri + React + Supabase**.

> **Status:** In active development. This repo currently implements **Step 1** of the build plan — the Tauri + React + Supabase scaffold, auth + admin-invite flow, and RLS foundations. See [Roadmap](#roadmap).

---

## Tech stack

| Layer            | Choice                                                             |
| ---------------- | ----------------------------------------------------------------- |
| Desktop shell    | [Tauri 2](https://tauri.app) (Rust) — macOS universal build       |
| Frontend         | React 19 + TypeScript + Vite 7                                     |
| Styling          | Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com)              |
| Backend / data   | [Supabase](https://supabase.com) — Postgres, Auth, Realtime, Storage |
| Data fetching    | TanStack Query v5                                                  |
| Local UI state   | Zustand                                                            |
| Block editor     | TipTap (ProseMirror) — _added in Step 2_                           |

---

## Prerequisites

- **Node.js** ≥ 20 (repo developed on Node 22)
- **Rust** (stable) + Cargo — install via [rustup](https://rustup.rs): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Xcode Command Line Tools** — `xcode-select --install`
- A **Supabase project** (see below)

---

## Setup

### 1. Install dependencies

```bash
cd ofm-workspace
npm install
```

### 2. Create a Supabase project

1. Go to <https://supabase.com/dashboard> and create a **new project** (this app is designed to run in its own dedicated project, isolated from any other database).
2. Note your **Project URL** and **publishable/anon key** (Project Settings → API).

### 3. Configure client env

```bash
cp .env.example .env
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
**Never** put the `service_role` key in `.env` — it's a server-only secret (see step 6).

### 4. Link the CLI and apply the database schema

```bash
# Log in to the Supabase CLI (opens a browser)
npx supabase login

# Link this folder to your project (find the ref in the dashboard URL / settings)
npx supabase link --project-ref <your-project-ref>

# Apply all migrations (tables, RLS policies, functions, triggers)
npx supabase db push
```

### 5. Generate typed database types

```bash
npx supabase gen types typescript --linked > src/lib/database.types.ts
```

### 6. Deploy the Edge Functions (privileged operations)

The admin **invite** and **deactivate** operations require the `service_role` key, so they run server-side in Supabase Edge Functions — never in the client.

```bash
# Set the service_role key as a function secret (server-side only)
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Deploy the functions
npx supabase functions deploy invite-user
npx supabase functions deploy deactivate-user
```

### 7. Bootstrap the first owner

The very first Owner account can't be invited (there's no owner yet to send the invite). See [`supabase/README.md`](supabase/README.md) for the one-time bootstrap command.

---

## Running

```bash
# Web-only (fast, runs in a browser at http://localhost:1420)
npm run dev

# Full native desktop app (compiles the Rust shell — slow on first run)
npm run tauri dev
```

> The first `tauri dev` compiles the Rust dependencies and can take several minutes. Subsequent runs are fast.

---

## Building & packaging (macOS `.dmg`)

```bash
# Universal binary (Apple Silicon + Intel)
rustup target add x86_64-apple-darwin aarch64-apple-darwin
npm run tauri build -- --target universal-apple-darwin
```

The signed `.dmg` requires an Apple Developer ID certificate; see Tauri's [macOS code-signing guide](https://tauri.app/distribute/sign/macos/). Code signing is deferred to the packaging step of the roadmap.

---

## Project structure

```
ofm-workspace/
├─ src/
│  ├─ components/ui/      # shadcn/ui primitives
│  ├─ features/           # feature modules (auth, team, …)
│  ├─ lib/                # supabase client, query client, theme, utils
│  ├─ stores/             # Zustand stores
│  ├─ App.tsx             # router
│  └─ main.tsx            # providers + entry
├─ src-tauri/             # Rust desktop shell + tauri.conf.json
└─ supabase/
   ├─ migrations/         # SQL schema + RLS policies
   └─ functions/          # Edge Functions (invite-user, deactivate-user)
```

---

## Roles & permissions

Three roles, enforced by Postgres **Row-Level Security** (never trusted from the client):

| Role        | Can do                                                                 |
| ----------- | --------------------------------------------------------------------- |
| **Owner**   | Everything: invite/remove users, assign roles, see all data          |
| **Manager** | Manage assigned creators, see team schedules, edit most content       |
| **Chatter** | See own shifts, assigned creators, templates and tasks; limited edits |

Deactivated users lose all access immediately (RLS gates on live membership status).

---

## Roadmap

1. ✅ **Scaffold** — Tauri + React + Supabase; auth + admin-invite; RLS foundations _(this step)_
2. ⬜ Core engine — sidebar page tree + block editor
3. ⬜ Databases + views (table / board / calendar / gallery / list)
4. ⬜ OFM module templates (creators, content, shifts/handoffs, wiki, tasks, revenue, templates, chat)
5. ⬜ Realtime sync, comments/@mentions, team chat
6. ⬜ Revenue dashboard + charts
7. ⬜ Polish — shortcuts, cmd-K search, macOS packaging/signing

**Out of scope for v1:** creator/client logins, OnlyFans/Fansly API integrations, automated DM sending, mobile apps, offline mode, billing.
