import { useState, type ReactNode, useEffect} from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Bell, Check, Copy, Crown, Database, Lock, Shield, Trash2, User,
} from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { DEMO_NOTICE, EXPEDITIONS, GUIDES, IS_DEMO, monogram } from "@/data/demo";
import { formatEur, type Cents } from "@/money/model";
import { useAuth } from "@/lib/auth";
import { updateDisplayName } from "@/auth/account";
import { cn } from "@/lib/utils";

/**
 * Settings — account, plan, privacy, notifications, data.
 *
 * ── A SETTINGS PAGE IS A PAGE OF PROMISES ───────────────────────────────────
 *
 * Every switch here is a claim that something downstream obeys it. Almost
 * nothing downstream exists: no account server, no email service, no push, no
 * payment processor, no directory of climbers. A page of switches that quietly
 * change React state would be the most convincing lie in the app, because
 * people READ settings as a record of what is happening to them — someone
 * would turn location sharing off and believe they had turned something off.
 *
 * So each control is one of three declared things, never ambiguous:
 *
 *   WORKING     the profile form, Copy and Clear under Data. All three act on
 *               this browser, which is the only place anything is held.
 *   LOCKED      privacy controls, shown at the setting that is currently TRUE
 *               and unable to move.
 *   PREFERENCE  the notification switches. They move, they do not persist,
 *               and the header says so once.
 *
 * WHY PRIVACY IS LOCKED RATHER THAN TOGGLEABLE: the off state is a fact, not a
 * preference. Nothing reads your location, nothing publishes your passport,
 * nobody can search for you. Sliding "share my location" to ON would render a
 * false statement about your own data in the one place you would go to check.
 *
 * WHY THE PROFILE FORM IS REAL: it writes the local session
 * (`icefall.web.session.v1`), which is the entirety of what ICEFALL holds. The
 * bio field is the exception and is locked rather than inert — a textarea you
 * can fill for ten minutes before learning it goes nowhere is worse than one
 * you cannot type into at all.
 *
 * ── THE TEXT BUDGET (2026-08 tightening pass) ───────────────────────────────
 *
 * This file used to carry ~29 grey explanatory paragraphs — one under nearly
 * every control, each re-explaining that there is no server. Repetition made
 * the page unreadable and, worse, made the honesty look like an apology. The
 * budget is now TWO visible explanatory blocks for the whole page:
 *
 *   1. the one-line subhead under the H1 ("nothing leaves this browser"),
 *   2. {DEMO_NOTICE} at the foot.
 *
 * Everything the deleted paragraphs said is preserved as either (a) a short
 * label / badge on the control it concerns — "Needs an account", "Not on
 * sale", "None", "—" — or (b) a comment in this file. Specifically:
 *
 *   • Bio, Premium checkout, passport audiences, privacy switches: each was a
 *     paragraph explaining the missing server. Now a 2–4 word locked label; the
 *     shared reason is the subhead, stated once.
 *   • Premium's price: no processor is connected and nobody has ever been
 *     charged; the number is the design target only. Carried by the "Not on
 *     sale" badge and the "Indicative price" caption.
 *   • Premium gating: no gate is switched on, so nothing is withheld from
 *     anyone on Free today. Carried by the Paywall / Gated pages status strip.
 *   • Data export: printed rather than downloaded, because an export button
 *     implies a server gathered a file, and the record is two fields.
 *   • Delete: deleting and signing out are the same act — the local key is
 *     removed and that is all. Carried by the "No server account" badge.
 *   • The waitlist exception: the public launch page DOES post a real name and
 *     email to a real table, and no control in this app can delete it yet.
 *     Too important to drop, so it survives as two dl rows under Privacy and a
 *     locked row under Data — as facts in a table, not as a confession.
 *
 * Layout follows the same logic: a segmented control replaced the old settings
 * sidebar (the shell already has one) and each pane is a two-column grid, so
 * the first screen is controls rather than prose.
 */

type SectionId = "profile" | "plan" | "privacy" | "notifications" | "data";

const SECTIONS: { id: SectionId; label: string; icon: typeof User }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "plan", label: "Plan", icon: Crown },
  { id: "privacy", label: "Privacy", icon: Shield },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "data", label: "Data", icon: Database },
];

export default function Settings() {
  const [section, setSection] = useState<SectionId>("profile");

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div>
          <h1 className="text-[24px] font-light tracking-[-0.02em] text-snow">Settings</h1>
          {/* Explanatory block 1 of 2. The whole page's "why" lives in this line. */}
          <p className="mt-1.5 text-[13px] text-mist">
            Nothing here leaves this browser. Controls that need a server are locked.
          </p>
        </div>
        <Badge>Free plan</Badge>
      </div>

      <div
        role="tablist"
        aria-label="Settings sections"
        className="mt-6 flex w-fit max-w-full flex-wrap gap-1 rounded-pill border border-hairline bg-graphite p-1"
      >
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            onClick={() => setSection(s.id)}
            className={cn(
              "flex items-center gap-2 rounded-pill px-4 py-2 text-[13px] transition-colors",
              section === s.id
                ? "bg-azure/[0.12] text-azure"
                : "text-mist hover:bg-white/[0.03] hover:text-snow",
            )}
          >
            <s.icon size={15} strokeWidth={1.7} />
            {s.label}
          </button>
        ))}
      </div>

      {section === "profile" && <ProfilePane />}
      {section === "plan" && <PlanPane />}
      {section === "privacy" && <PrivacyPane />}
      {section === "notifications" && <NotificationsPane />}
      {section === "data" && <DataPane />}

      {/* Explanatory block 2 of 2 — the only one allowed below the fold. */}
      {IS_DEMO && (
        <p className="mt-8 border-l-2 border-azure/30 pl-4 text-[11px] leading-relaxed text-mist-dim">
          {DEMO_NOTICE}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Profile                                                                    */
/* -------------------------------------------------------------------------- */


function ProfilePane() {
  const { session, openAuth } = useAuth();
  const [name, setName] = useState(session?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // The session arrives asynchronously; seed the field once it does rather than
  // leaving a returning climber staring at an empty name box.
  useEffect(() => {
    if (session) setName(session.name);
  }, [session]);

  const cleanName = name.trim();
  const changed = cleanName !== (session?.name ?? "");
  const canSave = Boolean(session) && cleanName.length > 0 && changed && !busy;

  /*
    THIS PANE USED TO CALL `signUp(name, email)` TO "Create local session".

    That made sense when a session was a name and an email in localStorage. With
    real accounts it is meaningless — you do not create an account by editing a
    settings field, and re-running sign-up for a signed-in person is not a save.

    The name is now a real change to the account, and **the email is read-only
    on purpose**: moving an account to a new address requires that address to
    prove it is reachable first, or an account can be moved to one its owner does
    not control. That flow does not exist, so this says so instead of showing a
    field that silently does nothing.
  */
  const saveStatus = status ?? (changed ? "Unsaved changes" : "Nothing to save");

  return (
    <Pane title="Profile" className="xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <div className="flex items-center gap-4 border-b border-hairline pb-5">
          <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full border border-hairline bg-elevated/60 text-[16px] font-light tracking-[0.05em] text-mist">
            {monogram(cleanName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] text-snow">{session?.name ?? "No session"}</p>
            <p className="mt-1 truncate text-[12px] text-mist-dim">{session?.email ?? "—"}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field label="Name">
            <input
              value={name}
              disabled={!session || busy}
              onChange={(e) => {
                setName(e.target.value);
                setStatus(null);
              }}
              placeholder="Your name"
              autoComplete="name"
              className={inputClass}
            />
          </Field>
          <Field label="Email">
            <input
              value={session?.email ?? ""}
              readOnly
              placeholder="Not signed in"
              autoComplete="email"
              inputMode="email"
              aria-describedby="email-locked"
              className={cn(inputClass, "cursor-not-allowed opacity-70")}
            />
            <p id="email-locked" className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">
              Changing this needs the new address to confirm itself first, which
              ICEFALL cannot send yet.
            </p>
          </Field>
        </div>

        {/*
          Bio was a disabled textarea with a paragraph inside its placeholder.
          A bio belongs to a profile other people can open, which means a
          server. Now a locked row with a three-word label instead.
        */}
        <div className="mt-5 flex items-center justify-between gap-4 rounded-tile border border-hairline bg-elevated/40 px-3.5 py-3">
          <span className="text-[12.5px] text-mist">Bio</span>
          <Badge>
            <Lock size={10} strokeWidth={2} />
            Needs an account
          </Badge>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-hairline pt-5">
          {session ? (
            <Button
              size="sm"
              disabled={!canSave}
              onClick={async () => {
                setBusy(true);
                setStatus(null);
                const r = await updateDisplayName(cleanName);
                setStatus(r.ok ? "Saved" : r.message);
                setBusy(false);
              }}
            >
              {busy ? "Saving" : "Save"}
            </Button>
          ) : (
            <Button size="sm" onClick={() => openAuth("in")}>
              Sign in
            </Button>
          )}
          <span className="text-[11.5px] text-mist-dim">{saveStatus}</span>
        </div>
      </Card>

      <Card>
        <p className="section-label">Held about you</p>
        <dl className="mt-4 divide-y divide-hairline">
          <Held label="Name" value={session?.name ?? "—"} />
          <Held label="Email" value={session?.email ?? "—"} />
          {/*
            Was "None", which was true when no password was ever kept. There is
            a real account now: the password is held by the account server,
            hashed, and never by ICEFALL or this browser.
          */}
          <Held label="Password" value={session ? "Held by the account server" : "—"} />
          <Held label="Photo" value="None" />
          <Held label="Location history" value="None" />
          <Held label="Everything else" value="Nothing" />
          <Held label="Stored under" value={<span className="tnum">icefall.web.session.v1</span>} />
        </dl>
        <Link
          to="/app/profile"
          className="mt-4 inline-flex items-center gap-2 text-[12.5px] text-azure transition-colors hover:text-azure-bright"
        >
          See the record this feeds
          <ArrowRight size={14} strokeWidth={1.8} />
        </Link>
      </Card>
    </Pane>
  );
}

/* -------------------------------------------------------------------------- */
/* Plan                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The intended monthly price, in cents. A number on a plan card is read as a
 * commitment; this one is a design decision that no processor has ever charged
 * — hence the "Not on sale" badge and the "Indicative price" caption.
 */
const PREMIUM_MONTHLY: Cents = 900;

const FREE_INCLUDES: readonly string[] = [
  "The full route and mountain library",
  "Your record, passport and summits",
  "Coach assessment and this training week",
  "Search across whatever is listed",
];

const PREMIUM_ADDS: readonly { title: string; detail: string }[] = [
  {
    title: "The whole training build",
    detail: "Every week to a dated objective, rebuilt when you miss one.",
  },
  { title: "Offline maps", detail: "Downloaded before you lose signal." },
  { title: "The full directory", detail: "Every listed operator and guide." },
  { title: "Unlimited coach conversations", detail: "Instead of a few a week." },
  { title: "Conditions history", detail: "The whole season on a face, not only today." },
];

function PlanPane() {
  return (
    <Pane title="Plan" className="lg:grid-cols-2">
      <div className="rounded-card border border-hairline bg-graphite p-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[16px] font-light text-snow">Free</p>
          <Badge tone="azure">Current plan</Badge>
        </div>
        <p className="tnum mt-3 text-[26px] font-light leading-none text-snow">{formatEur(0)}</p>
        <p className="mt-2 text-[11.5px] text-mist-dim">The only plan anybody is on</p>
        <ul className="mt-5 space-y-3 border-t border-hairline pt-5">
          {FREE_INCLUDES.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-mist">
              <Check size={14} strokeWidth={1.9} className="mt-[3px] shrink-0 text-mist-dim" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-card border border-azure/25 bg-azure/[0.04] p-5">
        <div className="flex items-center justify-between gap-4">
          <p className="flex items-center gap-2 text-[16px] font-light text-snow">
            <Crown size={16} strokeWidth={1.6} className="text-azure" />
            Premium
          </p>
          <Badge>Not on sale</Badge>
        </div>
        <p className="tnum mt-3 text-[26px] font-light leading-none text-snow">
          {formatEur(PREMIUM_MONTHLY)}
          <span className="text-[13px] text-mist"> / month</span>
        </p>
        <p className="mt-2 text-[11.5px] text-mist-dim">Indicative price</p>
        <ul className="mt-5 space-y-4 border-t border-azure/20 pt-5">
          {PREMIUM_ADDS.map((f) => (
            <li key={f.title} className="flex items-start gap-2.5">
              <Check size={14} strokeWidth={1.9} className="mt-[3px] shrink-0 text-azure" />
              <span className="min-w-0">
                <span className="block text-[12.5px] text-snow">{f.title}</span>
                <span className="mt-1 block text-[11.5px] leading-relaxed text-mist">
                  {f.detail}
                </span>
              </span>
            </li>
          ))}
        </ul>
        {/* No processor is connected, so this opens no checkout rather than a dead one. */}
        <div className="mt-5 border-t border-azure/20 pt-5">
          <Button variant="secondary" size="sm" disabled>
            <Lock size={13} strokeWidth={1.9} />
            No checkout yet
          </Button>
        </div>
      </div>

      {/*
        Replaces a two-paragraph card. The point it made — no gate is switched
        on, so nothing is withheld from anyone on Free — is now three readable
        values instead of prose.
      */}
      <Card className="lg:col-span-2">
        <p className="section-label">Status today</p>
        <div className="mt-4 grid gap-5 border-t border-hairline pt-4 sm:grid-cols-3">
          <Stat label="Paywall" value="Off" />
          <Stat label="Gated pages" value="None" />
          <Stat
            label="Directory"
            value={IS_DEMO ? `${EXPEDITIONS.length + GUIDES.length} demo listings` : "None yet"}
          />
        </div>
      </Card>
    </Pane>
  );
}

/* -------------------------------------------------------------------------- */
/* Privacy                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Each audience carries the setting that is true today. "Only you" is the one
 * available option because it is the only true statement: the passport is drawn
 * on this device from this session and has no address anybody else can open.
 */
const PASSPORT_AUDIENCES: readonly {
  id: string;
  label: string;
  detail: string;
  available: boolean;
}[] = [
  { id: "you", label: "Only you", detail: "Current", available: true },
  { id: "party", label: "People you climb with", detail: "Needs groups", available: false },
  { id: "link", label: "Anyone with the link", detail: "Needs a public page", available: false },
];

function PrivacyPane() {
  return (
    <Pane title="Privacy" className="xl:grid-cols-2">
      {/*
        Locked, not toggleable. Off is a fact here: the site never asks the
        browser for a location, no training history is recorded, and ICEFALL
        keeps no directory of climbers for a search to return.
      */}
      <Card>
        <p className="section-label">Sharing</p>
        <div className="mt-4 border-t border-hairline pt-4">
          <SettingRow label="Share my location" on={false} lock="Never requested" />
          <SettingRow label="Let guides see my training history" on={false} lock="Needs an account" />
          <SettingRow label="Appear in search" on={false} lock="No directory yet" />
        </div>
      </Card>

      <Card>
        <p className="section-label">Who can see your passport</p>
        <div role="radiogroup" aria-label="Who can see your passport" className="mt-4 space-y-2.5">
          {PASSPORT_AUDIENCES.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={a.available}
              disabled
              className={cn(
                "flex w-full cursor-not-allowed items-center gap-3 rounded-tile border p-3.5 text-left",
                a.available ? "border-azure/35 bg-azure/[0.06]" : "border-hairline bg-slate/40",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full border",
                  a.available ? "border-azure" : "border-hairline-strong",
                )}
              >
                {a.available && <span className="h-[7px] w-[7px] rounded-full bg-azure" />}
              </span>
              <span className={cn("min-w-0 truncate text-[13px]", a.available ? "text-snow" : "text-mist")}>
                {a.label}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11.5px] text-mist-dim">
                {!a.available && <Lock size={11} strokeWidth={1.9} />}
                {a.detail}
              </span>
            </button>
          ))}
        </div>
        <Link
          to="/app/profile"
          className="mt-4 inline-flex items-center gap-2 text-[12.5px] text-azure transition-colors hover:text-azure-bright"
        >
          See what is on the passport
          <ArrowRight size={14} strokeWidth={1.8} />
        </Link>
      </Card>

      {/*
        The one honest exception, kept as a table rather than a confession. The
        signed-in app posts nothing anywhere — but the public launch page has a
        real endpoint behind it, and a privacy section implying otherwise would
        be wrong on the single point that actually involves a database.
      */}
      <Card className="xl:col-span-2">
        <p className="section-label">What leaves this browser</p>
        <dl className="mt-4 divide-y divide-hairline border-t border-hairline pt-2">
          <Held label="Waitlist form, public page" value="Name and email, stored" />
          <Held label="Every page behind the sidebar" value="Nothing" />
        </dl>
      </Card>
    </Pane>
  );
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

const NOTIFICATION_TYPES: readonly {
  id: string;
  label: string;
  detail: string;
  initial: boolean;
}[] = [
  {
    id: "booking",
    label: "A booking is confirmed or changes",
    detail: "Dates moved, guide reassigned, cancellations",
    initial: true,
  },
  {
    id: "balance",
    label: "A balance falls due",
    detail: "Before the remainder is payable",
    initial: true,
  },
  { id: "message", label: "A guide or company replies", detail: "Anything arriving in Messages", initial: true },
  {
    id: "weather",
    label: "A weather window opens",
    detail: "The forecast turning on a saved objective",
    initial: true,
  },
  {
    id: "training",
    label: "Your training week is ready",
    detail: "The coach rebuilding the block ahead",
    initial: false,
  },
  {
    id: "news",
    label: "Product news from ICEFALL",
    detail: "New countries, operators, changes",
    initial: false,
  },
];

function NotificationsPane() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => {
    const seed: Record<string, boolean> = {};
    for (const n of NOTIFICATION_TYPES) seed[n.id] = n.initial;
    return seed;
  });

  return (
    <Pane title="Notifications" className="xl:grid-cols-[minmax(0,1fr)_300px]">
      {/*
        These switches move but persist nothing: no mail service, no push
        service, no account to store a preference against, so a reload resets
        them. The badge states that above the controls rather than under them —
        a disclaimer placed after a switch is read second, if at all, and by
        then someone has already flipped it believing it took effect.
      */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="section-label">Interrupt me for</p>
          <Badge>Preference only, never sent</Badge>
        </div>
        <div className="mt-4 border-t border-hairline pt-4">
          {NOTIFICATION_TYPES.map((n) => (
            <SettingRow
              key={n.id}
              label={n.label}
              detail={n.detail}
              on={prefs[n.id]}
              onToggle={() => setPrefs((p) => ({ ...p, [n.id]: !p[n.id] }))}
            />
          ))}
        </div>
      </Card>

      {/*
        Email and push are not offered as separate choices because neither is
        connected — a channel picker would be two dead options instead of one.
        When a channel exists it gets a column here, and every default will be
        the quietest one that still gets a trip-critical message there in time.
      */}
      <Card>
        <p className="section-label">Channels</p>
        <dl className="mt-4 divide-y divide-hairline border-t border-hairline pt-2">
          <Held label="Email" value="Not connected" />
          <Held label="Push" value="Not connected" />
          <Held label="Sent to date" value={<span className="tnum">0</span>} />
        </dl>
      </Card>
    </Pane>
  );
}

/* -------------------------------------------------------------------------- */
/* Data                                                                       */
/* -------------------------------------------------------------------------- */

type CopyState = "idle" | "copied" | "failed";

function DataPane() {
  const { session, signOut } = useAuth();
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState(false);

  const record = JSON.stringify(session, null, 2);

  const copy = () => {
    if (!navigator.clipboard) {
      setCopyState("failed");
      return;
    }
    navigator.clipboard.writeText(record).then(
      () => setCopyState("copied"),
      () => setCopyState("failed"),
    );
  };

  // Short status labels only — the old version carried three sentences here.
  const clearStatus =
    cleared && session === null
      ? "Cleared"
      : session === null
        ? "Nothing to clear"
        : confirming
          ? "Removes name and email"
          : "";

  return (
    <Pane title="Data" className="xl:grid-cols-2">
      {/*
        Printed instead of downloaded. An export button implies a server went
        away, gathered what it holds on you and assembled a file — the record
        here is two fields in local storage, and showing it outright is faster
        and a truer picture of how little there is.
      */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="section-label">Your record, in full</p>
          <Badge>Nothing to request</Badge>
        </div>
        <p className="tnum mt-3 text-[11.5px] text-mist-dim">icefall.web.session.v1</p>
        <pre className="tnum mt-3 max-h-[220px] overflow-auto rounded-tile border border-hairline bg-obsidian p-4 text-[12px] leading-relaxed text-snow">
          {record}
        </pre>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Button variant="secondary" size="sm" onClick={copy}>
            <Copy size={14} strokeWidth={1.8} />
            Copy it
          </Button>
          <span className="text-[11.5px] text-mist-dim">
            {copyState === "copied" ? "Copied" : copyState === "failed" ? "Clipboard blocked" : ""}
          </span>
        </div>
      </Card>

      {/*
        Deleting and signing out are the same act: nothing was created on a
        server when you signed in, so the local key is removed and that is the
        end of it. You can make it again from Profile.
      */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="section-label">Delete</p>
          <Badge>No server account</Badge>
        </div>

        <dl className="mt-4 divide-y divide-hairline border-t border-hairline pt-2">
          <Held label="On a server" value="Nothing" />
          <Held label="In this browser" value={session === null ? "Nothing" : "Name and email"} />
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
          {!confirming && (
            <Button
              variant="secondary"
              size="sm"
              disabled={session === null}
              onClick={() => setConfirming(true)}
            >
              <Trash2 size={14} strokeWidth={1.8} />
              Clear this session
            </Button>
          )}
          {confirming && (
            <>
              <Button
                variant="secondary"
                size="sm"
                className="border-danger/45 text-danger"
                onClick={() => {
                  signOut();
                  setConfirming(false);
                  setCleared(true);
                }}
              >
                <Trash2 size={14} strokeWidth={1.8} />
                Clear it
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Keep it
              </Button>
            </>
          )}
          {clearStatus !== "" && <span className="text-[11.5px] text-mist-dim">{clearStatus}</span>}
        </div>

        {/*
          The one thing this button cannot reach: a waitlist address given on
          the public launch page. That row is on a server and no control in this
          app can delete it yet. When there is one, it belongs on this card.
        */}
        <div className="mt-4 flex items-center justify-between gap-4 border-t border-hairline pt-4">
          <span className="text-[12px] text-mist">Waitlist address</span>
          <Badge>
            <Lock size={10} strokeWidth={2} />
            Not deletable here
          </Badge>
        </div>
      </Card>
    </Pane>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

const inputClass =
  "h-11 w-full rounded-tile border border-hairline bg-elevated px-3.5 text-[13.5px] text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50";

/**
 * The pane heading is the segmented control above it, so the title survives
 * only as an accessible name — repeating it visually was one more line of text
 * between the reader and the controls.
 */
function Pane({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className={cn("mt-6 grid items-start gap-5", className)}>
      {children}
    </section>
  );
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-card border border-hairline bg-graphite p-5", className)}>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12.5px] text-snow">{label}</span>
      <span className="mt-2.5 block">{children}</span>
    </label>
  );
}

function Held({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2.5">
      <dt className="shrink-0 text-[12.5px] text-mist">{label}</dt>
      <dd className="truncate text-[12.5px] text-snow">{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11.5px] text-mist-dim">{label}</p>
      <p className="tnum mt-1.5 text-[15px] font-light text-snow">{value}</p>
    </div>
  );
}

/**
 * A row with a switch. No `onToggle` means locked — the switch is disabled and
 * `lock` carries a 2–3 word reason, which is required in practice: a stuck
 * control with no label at all reads as a bug, and people work around bugs.
 * The full reason lives in the pane comments, not on screen.
 */
function SettingRow({
  label,
  detail,
  on,
  onToggle,
  lock,
}: {
  label: string;
  detail?: string;
  on: boolean;
  onToggle?: () => void;
  lock?: string;
}) {
  const locked = onToggle === undefined;
  return (
    <div className="flex items-start justify-between gap-6 border-t border-hairline py-3.5 first:border-t-0 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-[13.5px] text-snow">{label}</p>
        <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-mist-dim">
          {lock !== undefined && <Lock size={11} strokeWidth={1.9} className="shrink-0" />}
          {lock ?? detail}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={locked ? `${label} — locked off` : label}
        disabled={locked}
        onClick={onToggle}
        className={cn(
          "relative mt-0.5 h-[22px] w-[38px] shrink-0 rounded-pill border transition-colors",
          on ? "border-azure/55 bg-azure/25" : "border-hairline-strong bg-slate",
          locked && "cursor-not-allowed opacity-50",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 h-[14px] w-[14px] -translate-y-1/2 rounded-full transition-all",
            on ? "left-[19px] bg-azure" : "left-[3px] bg-mist-dim",
          )}
        />
      </button>
    </div>
  );
}
