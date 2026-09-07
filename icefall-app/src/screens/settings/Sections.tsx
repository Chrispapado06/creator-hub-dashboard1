import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  Award,
  Bell,
  Building2,
  Camera,
  Check,
  ChevronLeft,
  Copy,
  Download,
  ExternalLink,
  Facebook,
  Flag,
  Globe,
  Instagram,
  LifeBuoy,
  LogOut,
  MapPin,
  Mountain as MountainIcon,
  Music2,
  Pickaxe,
  RotateCcw,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Trash2,
  Watch,
  X,
  Youtube,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Button,
  Card,
  Disclaimer,
  SectionLabel,
  Stat,
  sharePage,
} from "@/components/ui/primitives";
import { Rise, TABBAR_CLEAR } from "@/components/layout/chrome";
import {
  ActionRow,
  ChoiceRow,
  Group,
  InfoRow,
  LinkRow,
  SettingsPage,
  StatusPill,
  ToggleRow,
} from "@/components/settings/kit";
import {
  POST_VISIBILITY_OPTIONS,
  VISIBILITY_OPTIONS,
  memberId,
  useSettings,
  type PostVisibility,
  type Visibility,
} from "@/settings/store";
import { LOCATION_NOTICE, SAFETY_REMINDER, approxDistanceLabel } from "@/network/privacy";
import { useApp, usePrimaryGoal } from "@/state/AppState";
import { planFor } from "@/growth/tiers";
import { fmtDate } from "@/lib/format";
import { encodeProfile, profileLink, type SharedProfile } from "@/profile/shareLink";
import { AVATAR_PX, readBanner } from "@/lib/image";
import { isBackendConfigured } from "@/backend/client";
import { PROFILE_BANNERS, bannerFor, bannerIndex } from "@/profile/banners";
import { BADGES, badgeState } from "@/badges/model";
import { BadgeHex } from "@/components/domain/BadgeHex";
import { PhotoAdjuster } from "@/components/settings/PhotoAdjuster";
import { supabase } from "@/backend/client";
import { sendPasswordReset, signOut as signOutServer, signOutEverywhere } from "@/auth/account";
import SupportRequest from "./SupportRequest";
import { SUPPORT_ABUSE_IS_SEPARATE, SUPPORT_NO_RESPONSE_TIME } from "@/support/tickets";
import { Listbox } from "@/components/ui/Listbox";
import { cn } from "@/lib/utils";
import { countryName, useMyProfile, type MyProfileState } from "@/auth/useMyProfile";
import {
  COUNTRY_IS_NEVER_PARSED,
  SYNC_NOT_DEPLOYED,
  SYNC_NO_PHOTO_STORE,
  fetchInterestTags,
  flushProfile,
  pendingProfileEdit,
  saveProfile,
  type FieldResult,
  type FieldState,
  type InterestTag,
  type ProfileEdit,
  type ProfileFieldName,
  type SaveProfileResult,
} from "@/settings/sync";
import {
  HANDLE_CHANGE_BREAKS_LINKS,
  PROBLEM_TEXT,
  availabilitySentence,
  changeFailureSentence,
  changeUsername,
  changeWarning,
  checkAvailability,
  fetchHoldPromise,
  formatProblem,
  normalise,
  releasedSentence,
  type Availability,
  type HoldPromise,
} from "@/auth/username";

/**
 * Every settings sub-screen, in one file.
 *
 * They are small — a heading, a few rows, a note — and splitting nineteen of
 * them across nineteen files would make the section harder to read and to keep
 * consistent, not easier. Each is its own component; the router picks one.
 *
 * The rule they all share: a control that cannot do anything says so on the
 * screen. ICEFALL has no server, so email, password, sessions, subscriptions
 * and applications are all stored locally or stated as unavailable — never
 * rendered as a live control that silently does nothing.
 */
export default function SettingsSection() {
  const { section } = useParams<{ section: string }>();

  switch (section) {
    case "profile":
      return <EditProfile />;
    case "share":
      return <ShareProfile />;
    case "verification":
      return <Verification />;
    case "passport":
      return <PassportSettings />;
    case "account":
      return <Account />;
    case "security":
      return <Security />;
    case "privacy":
      return <Privacy />;
    case "location":
      return <Location />;
    case "safety":
      return <Safety />;
    case "professional":
      return <Professional />;
    case "mountains":
      return <MyMountains />;
    case "cv":
      return <MountainCV />;
    case "data":
      return <DataActivity />;
    case "devices":
      return <Devices />;
    case "offline":
      return <OfflineData />;
    case "membership":
      return <Membership />;
    case "referrals":
      return <Referrals />;
    case "notifications":
      return <Notifications />;
    case "support":
      return <Support />;
    case "contact":
      return <SupportRequest />;
    case "legal":
      return <Legal />;
    case "about":
      return <About />;
    case "manage":
      return <ManageAccount />;
    default:
      return <Navigate to="/settings" replace />;
  }
}

/* ========================================================================== */
/* Profile                                                                    */
/* ========================================================================== */

/* --------------------------------------------------------------------------
 * PROFILE EDITS NOW LEAVE THE PHONE — AND EVERY FIELD SAYS WHETHER IT ARRIVED.
 *
 * WHAT WAS WRONG. Every control in this section wrote through `patch()`, which
 * is localStorage and nothing else. Nothing in the app has ever issued an
 * UPDATE against `profiles` — every `from("profiles")` call is a `select`. So a
 * person changed their name, their bio and their photograph, watched all three
 * change in front of them, and no other human being ever saw any of it: the
 * public profile and the share link kept whatever signup had put there.
 *
 * WHAT IS DIFFERENT. The local write is UNCHANGED. It is what makes this screen
 * instant and what makes it work in a hut at 4am with no signal. The server
 * write is IN ADDITION, through `settings/sync.ts`, which reads the written row
 * back and reports, per field, what became of it.
 *
 * WHY PER FIELD AND NEVER PER SCREEN. Exactly half of this form can reach the
 * server today. `display_name`, `location_label` and `country_code` are live
 * columns with a working update policy; `bio`, `languages`, `interests` and a
 * bucket to put a photograph in arrive with a migration that is written and not
 * yet pushed. One tick over the whole form would be true of one half and a lie
 * about the other — so there is no screen-level tick anywhere below.
 *
 * WHEN IT SAVES: ON BLUR, plus an explicit Save on any field with something
 * unsent. Not on a keystroke timer — a debounce that fires mid-sentence sends
 * half a bio and then has to correct itself, and one long enough to avoid that
 * is long enough to lose the edit when somebody leaves. Leaving the box is the
 * moment a person is finished with it, and tapping anything else — including
 * the back arrow — blurs the box first. A field still dirty when this screen
 * unmounts is sent on the way out; if that send fails, `sync.ts` keeps it in
 * its outbox. Nothing typed is discarded because a request failed.
 *
 * THE ONE CONTROL THAT IS NOT SAVED ON BLUR IS THE HANDLE, because changing a
 * handle GIVES THE OLD ONE AWAY. That takes a deliberate tap and a warning
 * read first — see `HandleField`.
 *
 * WHAT NOTHING HERE MAY DO: show "Saved" before the server confirmed that
 * field. `FieldResult.state === "saved"` is the only thing that earns the word,
 * and `sync.ts` sets it only after reading the written row back.
 * -------------------------------------------------------------------------- */

/** The three states this screen owns, plus the five `sync.ts` reports. */
type FieldSync =
  | { kind: "untouched" }
  | { kind: "unsent" }
  | { kind: "saving" }
  | { kind: "done"; result: FieldResult };

/** Trim and collapse exactly as `sync.ts` does, so "is this different?" here
    and "is this different?" there cannot disagree. */
const tidy = (v: string | null | undefined) => (v ?? "").trim().replace(/\s+/g, " ");

/**
 * One save for one field, with the guard that matters: a REQUEST THAT LANDS
 * AFTER THE PERSON HAS TYPED AGAIN IS DISCARDED. Without it, an answer about
 * "chris" arrives after an answer about "christofis" and the field reports a
 * save of a value that is no longer in the box — the same sequence bug the
 * signup screen's availability check guards against, with worse consequences.
 */
function useFieldSync(field: ProfileFieldName, onSettled?: () => void) {
  const [sync, setSync] = useState<FieldSync>({ kind: "untouched" });
  const seq = useRef(0);

  const send = useCallback(
    async (edit: ProfileEdit): Promise<FieldResult | undefined> => {
      const mine = ++seq.current;
      setSync({ kind: "saving" });
      const result = await saveProfile(edit);
      const one = result.fields[field];
      onSettled?.();
      if (seq.current !== mine) return one;
      setSync(one ? { kind: "done", result: one } : { kind: "untouched" });
      return one;
    },
    [field, onSettled],
  );

  /** Somebody typed. Whatever the last answer said is now about an older value. */
  const touch = useCallback(() => {
    seq.current++;
    setSync({ kind: "unsent" });
  }, []);

  /**
   * Typed, then typed it back. There is nothing to send and nothing to report,
   * and leaving "Not sent yet" under a box that matches the server would be a
   * warning about a problem that does not exist.
   */
  const reset = useCallback(() => {
    seq.current++;
    setSync({ kind: "untouched" });
  }, []);

  return { sync, send, touch, reset };
}

const SYNC_TONE: Record<FieldState, string> = {
  saved: "text-summit",
  "not-yet-on-server": "text-mist-dim",
  queued: "text-azure",
  "not-storable": "text-danger",
  failed: "text-danger",
};

/**
 * The word at the head of the status line.
 *
 * "Saved" appears for exactly one state. `queued` and `not-yet-on-server` are
 * both "it is on this phone and nobody else has it", and they are two different
 * sentences because one may pass with signal and the other needs a migration.
 */
const SYNC_WORD: Record<FieldState, string> = {
  saved: "Saved",
  "not-yet-on-server": "On this phone only",
  queued: "Waiting to send",
  "not-storable": "Not saved",
  failed: "Not saved",
};

function SyncLine({
  tone,
  word,
  children,
}: {
  tone: string;
  word: string;
  children?: React.ReactNode;
}) {
  return (
    <p className="mt-2 text-[11.5px] leading-relaxed text-mist-dim">
      <span className={cn("text-[10.5px] uppercase tracking-[0.09em]", tone)}>{word}</span>
      {children ? <> — {children}</> : null}
    </p>
  );
}

const SAVE_BUTTON =
  "mt-2.5 rounded-pill border border-azure/45 bg-azure/[0.10] px-4 py-2.5 text-[12.5px] text-azure";

/**
 * What the server now holds, as a person can read it.
 *
 * `stored` comes back off the written row, and for two fields it is not what
 * anybody typed: languages are stored as ISO codes and interests as slugs. A
 * line reading "en, el" is a true statement rendered uselessly, so the codes go
 * back through `Intl` and the slugs back through the vocabulary they came from.
 * A code with no name and a slug not in the list are printed AS THEY ARE rather
 * than dropped — the row holds them either way.
 */
function storedText(
  field: ProfileFieldName,
  stored: string | string[] | null,
  tags: InterestTag[],
): string | null {
  if (stored === null) return null;
  if (typeof stored === "string") {
    if (stored.length === 0) return null;
    return field === "countryCode" ? (countryName(stored) ?? stored) : stored;
  }
  if (stored.length === 0) return null;
  if (field === "languages") {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames(undefined, { type: "language" });
    } catch {
      names = null;
    }
    return stored.map((code) => names?.of(code) ?? code).join(", ");
  }
  if (field === "interests") {
    return stored.map((slug) => tags.find((t) => t.slug === slug)?.label ?? slug).join(", ");
  }
  return stored.join(", ");
}

/**
 * The status under one field. Four shapes, one per thing that can be true.
 *
 * `resting` is what to say when nothing has been typed this session — it is
 * the caller's, because "what the server already holds" is a different question
 * for a live column and for one that does not exist yet.
 */
/**
 * NOTHING IS SAID ABOUT SENDING ON A BUILD THAT CANNOT SEND.
 *
 * Every field on this screen carries one of these, and on a build with no
 * Supabase client they all said the same thing — that the profile is saved on
 * this phone and nowhere else — six or seven times down one screen, each with a
 * dead "Try again". That is not news, it is the permanent condition of the
 * build, and it belongs in one sentence at the foot of the form.
 */
function SyncNote({
  field,
  sync,
  resting,
  typed,
  tags,
  onSave,
  onRetry,
}: {
  field: ProfileFieldName;
  sync: FieldSync;
  resting?: React.ReactNode;
  /** What is in the box, so an unchanged echo is not printed twice. */
  typed?: string;
  tags: InterestTag[];
  onSave: () => void;
  onRetry?: () => void;
}) {
  /*
   * A FIELD NOBODY HAS TOUCHED SAYS NOTHING.
   *
   * `resting` used to print a paragraph under EVERY box — "NOT KNOWN — ICEFALL
   * could not ask its server whether it can keep this…" — the same words six
   * times down one screen. The owner, 2026-09-07: "remove all that text not
   * needed like jesus ALL TEXT REMOVE." Correct: it was the sync machinery's
   * internal state printed as body copy, and it made the screen unreadable.
   *
   * NOTHING HONEST IS LOST. Those paragraphs described the SCREEN's state, not
   * the field's — one sentence at the foot of the form now covers it once. What
   * this component still says, and must keep saying, is what happened to a box
   * somebody actually edited: not sent, saving, saved, failed. That is a fact
   * about their edit and it stays.
   *
   * `resting` is still accepted so the two callers that pass a genuinely
   * field-specific fact can keep doing so; it is simply not rendered while the
   * field is untouched.
   */
  if (sync.kind === "untouched") return null;
  /* See the note above the component. */
  if (!isBackendConfigured()) return null;

  if (sync.kind === "unsent") {
    return (
      <div>
        <SyncLine tone="text-mist-dim" word="Not sent yet">
          It is on this phone and ICEFALL has not been told. Tap Save — or leave the box — and this
          line will say where it got to.
        </SyncLine>
        <button type="button" onClick={onSave} className={SAVE_BUTTON}>
          Save
        </button>
      </div>
    );
  }

  if (sync.kind === "saving") {
    return <SyncLine tone="text-azure" word="Sending" />;
  }

  const r = sync.result;
  const echo = r.state === "saved" ? storedText(field, r.stored ?? null, tags) : null;
  return (
    <div>
      <SyncLine tone={SYNC_TONE[r.state]} word={SYNC_WORD[r.state]}>
        {r.message}
      </SyncLine>
      {echo !== null && tidy(echo) !== tidy(typed) && (
        <p className="mt-1 text-[11px] leading-relaxed text-mist-dim">
          Other climbers see it as “{echo}”.
        </p>
      )}
      {r.dropped && r.dropped.length > 0 && (
        <p className="mt-1 text-[11px] leading-relaxed text-danger">
          Not stored: {r.dropped.join(", ")}.
        </p>
      )}
      {r.keptOnDevice && onRetry && (
        <button type="button" onClick={onRetry} className={SAVE_BUTTON}>
          Try again
        </button>
      )}
    </div>
  );
}

/**
 * Whether THIS deployment has the columns the profile migration adds.
 *
 * ASKED, NOT ASSUMED, AND NOT HARDCODED. `interest_tags`, `profiles.bio`,
 * `profiles.languages` and `profiles.interests` are created by ONE migration
 * file, so a successful read of the vocabulary is evidence for all four. A
 * missing table answers `not-provisioned`; every other failure — no signal, a
 * lapsed session — answers `unknown`, and `unknown` must never be rendered as
 * "there is nowhere to keep this", which would be a statement about ICEFALL's
 * server made on the strength of bad reception.
 *
 * IT DOES NOT ANSWER FOR THE PHOTOGRAPH. The same migration creates the
 * `profile-media` bucket inside a handler that SKIPS it where the deployment
 * will not grant storage privileges, so the columns can exist while the bucket
 * does not. The avatar's status therefore comes only from trying to upload one.
 *
 * The vocabulary it fetches is the interests picker, which is the other half of
 * why this call is worth making at all.
 */
type Deployment =
  | { state: "checking" }
  | { state: "ready"; tags: InterestTag[] }
  | { state: "absent" }
  | { state: "unknown" };

function useProfileColumns(): Deployment {
  const [state, setState] = useState<Deployment>({ state: "checking" });
  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await fetchInterestTags();
      if (!alive) return;
      setState(
        r.ok
          ? { state: "ready", tags: r.tags }
          : { state: r.failure === "not-provisioned" ? "absent" : "unknown" },
      );
    })();
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/** The resting line for a field whose column may not exist yet. */
function PendingColumnResting({ deployment }: { deployment: Deployment }) {
  switch (deployment.state) {
    case "checking":
      return (
        <SyncLine tone="text-mist-dim" word="Checking">
          Asking ICEFALL’s server whether it can keep this yet.
        </SyncLine>
      );
    case "absent":
      return (
        <SyncLine tone="text-mist-dim" word="On this phone only">
          {SYNC_NOT_DEPLOYED}
        </SyncLine>
      );
    case "ready":
      // NOT "not sent yet" — this screen has never read a bio back, so it does
      // not know whether a previous session's save is already on the server.
      // Asserting either way would be inventing a fact about somebody's row.
      return (
        <SyncLine tone="text-mist-dim" word="Not checked">
          ICEFALL’s server can keep this now. Whether it already holds what is in the box is only
          known by saving — leave the box, or tap Save.
        </SyncLine>
      );
    case "unknown":
      return (
        <SyncLine tone="text-mist-dim" word="Not known">
          ICEFALL could not ask its server whether it can keep this. It is on this phone either way,
          and saving will say what happened.
        </SyncLine>
      );
  }
}

/** The resting line for a column that is live today, compared against the row. */
function LiveColumnResting({
  profile,
  matches,
  blank,
}: {
  profile: MyProfileState;
  matches: boolean;
  /** The matching value is empty. A MEASURED absence — the row was read and
      holds nothing — which is a different sentence from holding something. */
  blank?: boolean;
}) {
  if (profile.status === "loading") {
    return (
      <SyncLine tone="text-mist-dim" word="Checking">
        Reading what ICEFALL’s server holds.
      </SyncLine>
    );
  }
  if (profile.status === "unavailable") {
    return (
      <SyncLine tone="text-mist-dim" word="Not known">
        ICEFALL could not read your profile from its server, so this screen cannot say what other
        climbers see. Being signed out and having no signal both land here.
      </SyncLine>
    );
  }
  if (matches && blank) {
    return (
      <SyncLine tone="text-mist-dim" word="Not set">
        ICEFALL’s server holds nothing here, and this box is empty. They agree.
      </SyncLine>
    );
  }
  return matches ? (
    <SyncLine tone="text-summit" word="On your profile">
      This is what ICEFALL’s server held when this screen opened.
    </SyncLine>
  ) : (
    <SyncLine tone="text-mist-dim" word="Not sent yet">
      ICEFALL’s server holds something else. Leave the box, or tap Save, to send this.
    </SyncLine>
  );
}

/** The text box, the hint, and the truth underneath it. */
function EditableField({
  label,
  value,
  onChange,
  onCommit,
  placeholder,
  multiline,
  hint,
  field,
  sync,
  resting,
  tags,
  onRetry,
  icon: Icon,
  prefix,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  placeholder?: string;
  multiline?: boolean;
  hint?: React.ReactNode;
  field: ProfileFieldName;
  sync: FieldSync;
  resting?: React.ReactNode;
  tags: InterestTag[];
  onRetry?: () => void;
  /** The mockup's leading glyph. Decorative — the label is the accessible name. */
  icon?: LucideIcon;
  /** Fixed text inside the box before the value, e.g. `https://`, `@`. */
  prefix?: string;
  children?: React.ReactNode;
}) {
  const id = useId();
  const shared =
    "w-full bg-transparent text-[14px] text-snow outline-none placeholder:text-mist-dim";
  return (
    <div className="pt-4 first:pt-0">
      {/*
        THE MOCKUPS' FIELD, and it is a rebuild rather than a restyle — the
        owner, 2026-09-07: "like the current edit profile delete everything
        thats in it, re build it".

        Label above in sentence case, then a rounded box holding a leading icon,
        an optional fixed prefix and the input. The old version was a row inside
        a bordered card, separated from its neighbours by hairlines, which is
        the boxy treatment the owner has asked to be rid of everywhere.
      */}
      <label htmlFor={id} className="block text-[12.5px] font-medium text-snow">
        {label}
      </label>
      <div
        className={cn(
          "mt-1.5 flex gap-2.5 rounded-[14px] border border-hairline-strong bg-slate px-3.5",
          multiline ? "items-start py-3" : "items-center py-3",
          "focus-within:border-azure/50",
        )}
      >
        {Icon !== undefined && (
          <Icon
            size={16}
            strokeWidth={1.7}
            aria-hidden
            className={cn("shrink-0 text-mist-dim", multiline && "mt-0.5")}
          />
        )}
        {prefix !== undefined && (
          <span className="shrink-0 text-[14px] text-mist-dim">{prefix}</span>
        )}
        {multiline ? (
          <textarea
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onCommit}
            placeholder={placeholder}
            rows={3}
            className={cn(shared, "resize-none")}
          />
        ) : (
          <input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onCommit}
            placeholder={placeholder}
            className={shared}
          />
        )}
      </div>
      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">{hint}</p>}
      {children}
      <SyncNote
        field={field}
        sync={sync}
        resting={resting}
        typed={value}
        tags={tags}
        onSave={onCommit}
        onRetry={onRetry}
      />
    </div>
  );
}

/**
 * The display name — a LIVE column, and the one field with no home on this
 * phone.
 *
 * `AppState` has no name setter: `state.name` is written by onboarding and by
 * `createAccount` and by nothing else, and this file does not own `AppState`.
 * So the box is seeded from the SERVER row and saved to the server, and the
 * hint says plainly which name this changes and which it does not. Half a truth
 * here would be somebody renaming themselves for strangers and wondering why
 * their own home screen disagrees — so the screen says it rather than hides it.
 */
function NameField({
  profile,
  tags,
  onSettled,
  onDirty,
}: {
  profile: MyProfileState;
  tags: InterestTag[];
  onSettled: () => void;
  /** Reports unsaved typing upward, so the screen's Save button knows. */
  onDirty?: (dirty: boolean) => void;
}) {
  const { user } = useApp();
  const { sync, send, touch, reset } = useFieldSync("displayName", onSettled);
  const [draft, setDraft] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  /** The last value handed to the server, so leaving the screen cannot send the
      same edit a second time just because the first one has not landed. */
  const attempted = useRef<string | null>(null);

  const base =
    confirmed ??
    (profile.status === "ready" ? profile.profile.displayName : null) ??
    user.name ??
    "";
  const value = draft ?? base;
  const nameDirty = draft !== null && draft !== base;
  useEffect(() => {
    onDirty?.(nameDirty);
  }, [nameDirty, onDirty]);
  const dirty = tidy(value) !== tidy(base);

  const commit = useCallback(async () => {
    if (!dirty) {
      reset();
      return;
    }
    attempted.current = value;
    const r = await send({ displayName: value });
    // The server trims and collapses; showing what it actually holds is the
    // point of reading the row back at all.
    if (r?.state === "saved" && typeof r.stored === "string") {
      setConfirmed(r.stored);
      setDraft(r.stored);
    }
  }, [dirty, reset, send, value]);

  // Sent on the way out if the box was left dirty — a swipe-back with the
  // keyboard open never fires a blur. Fire and forget: the screen is gone, so
  // nothing is claimed on it; a failure lands in `sync.ts`'s outbox and shows
  // as waiting the next time this screen opens.
  const latest = useRef({ dirty, value });
  latest.current = { dirty, value };
  useEffect(
    () => () => {
      const { dirty: d, value: v } = latest.current;
      if (d && v !== attempted.current) void saveProfile({ displayName: v });
    },
    [],
  );

  /* The mockup's card: label, one line of help, box, count. 80 is the real
     limit — `profiles.display_name` is CHECKed at 1–80 characters — so the
     number is measured rather than decorative. */
  return (
    <MockField
      label="Display name"
      help="This is your name that others will see."
      value={value}
      onChange={(v) => {
        setDraft(v);
        touch();
      }}
      onCommit={() => void commit()}
      max={80}
      placeholder="Your name"
    >
      <SyncNote
        field="displayName"
        sync={sync}
        tags={tags}
        onSave={() => void commit()}
        onRetry={() => void flushProfile()}
      />
    </MockField>
  );
}

/**
 * The handle — and the one control on this screen that is NOT saved on blur.
 *
 * WHY IT CANNOT GO THROUGH THE ORDINARY PATH. `profiles_update_self` pins the
 * username: the policy's WITH CHECK refuses any update where `username` differs
 * from the one already on the row. `sync.ts` therefore has no `username` key at
 * all, deliberately, and a text box wired to `patch()` would have gone on
 * looking like it worked forever. The only path is `claim_username`, which is
 * SECURITY DEFINER and claims the name atomically.
 *
 * WHY IT TAKES A TAP. A change gives the old handle away. `auth/username.ts`
 * already owns every sentence about that — the warning before, the read-back
 * after, and what became of the name released — precisely so this screen and
 * the signup screen cannot make different promises. Blur is not consent.
 *
 * THE LOCAL MIRROR IS WRITTEN ONLY ON A CONFIRMED CLAIM. `settings.username`
 * is what the share card prints as `@name`; mirroring an unclaimed draft would
 * put an address on a card sent to strangers that reaches nobody. The single
 * exception is a build with no server at all, where there is no namespace to
 * claim and the card is the only thing the handle was ever for — and it says
 * so in that case rather than implying a claim.
 */
function HandleField({ profile }: { profile: MyProfileState }) {
  const { settings, patch } = useSettings();
  /**
   * `useMyProfile` reads once and does not refetch, so after a successful claim
   * its answer is a handle nobody wears any more. Without this, the availability
   * check compares the new name against the OLD one, asks the server, and is
   * told "taken" — by the person themselves, one second after they took it.
   */
  const [claimedNow, setClaimedNow] = useState<string | null>(null);
  const current = claimedNow ?? (profile.status === "ready" ? profile.profile.username : null);

  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? current ?? settings.username;
  const candidate = normalise(value);
  const problem = formatProblem(candidate);
  /* Nothing is "a change" until somebody edits the box. Deriving it from the
     text alone put the give-away-your-handle warning on screen the moment Edit
     profile opened for anyone whose profile read had failed. */
  const changing =
    draft !== null && (current !== null ? candidate !== normalise(current) : candidate.length > 0);

  const [avail, setAvail] = useState<Availability>({ state: "unknown" });
  const [promise, setPromise] = useState<HoldPromise | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ good: boolean; lines: string[] } | null>(null);
  const seq = useRef(0);
  const id = useId();

  // Debounced availability, with the same sequence guard the signup screen
  // uses: a fast typist can have three checks in flight and the answer for
  // "chr" must not overwrite the answer for "chris".
  useEffect(() => {
    if (draft === null) return;
    if (problem) {
      setAvail({ state: problem === "empty" ? "unknown" : "format" });
      return;
    }
    const mine = ++seq.current;
    setAvail({ state: "checking" });
    const t = setTimeout(async () => {
      const r = await checkAvailability(candidate, current);
      if (seq.current === mine) setAvail(r);
    }, 350);
    return () => clearTimeout(t);
  }, [candidate, problem, current, draft]);

  // The hold window is read from the server only once somebody is actually
  // contemplating a change. Opening Edit profile should not cost an RPC that
  // most visits will never need.
  useEffect(() => {
    if (!changing || problem || promise) return;
    let alive = true;
    void fetchHoldPromise().then((p) => {
      if (alive) setPromise(p);
    });
    return () => {
      alive = false;
    };
  }, [changing, problem, promise]);

  const submit = useCallback(async () => {
    if (busy || problem) return;
    setBusy(true);
    setOutcome(null);
    const r = await changeUsername(candidate, current);

    if (r.ok) {
      patch({ username: r.username });
      setClaimedNow(r.username);
      setDraft(r.username);
      setAvail({ state: "current" });
      const lines = [`Your handle is @${r.username}.`];
      const released = releasedSentence(r.previous, r.released);
      if (released) lines.push(released);
      setOutcome({ good: true, lines });
      setBusy(false);
      return;
    }

    // Clear a stale tick first: a green "available" above a red "someone has
    // that one" is the screen arguing with itself.
    if (r.reason === "taken") setAvail({ state: "taken", suggestions: r.suggestions });
    else if (r.reason === "held")
      setAvail({ state: "held", heldUntil: r.heldUntil, suggestions: r.suggestions });
    else if (r.reason === "reserved") setAvail({ state: "reserved" });

    const lines = [changeFailureSentence(r)];
    if (r.reason === "no-backend") {
      // No server means no namespace to claim, so the local mirror is the only
      // thing a handle can be in this build — and the card is the only place it
      // appears. Kept, and described as exactly that.
      patch({ username: candidate });
      lines.push(
        `On this phone, the card you share now carries @${candidate}. That is the only place a handle appears in this build — nothing has been claimed and nobody can find you by it.`,
      );
    }
    setOutcome({ good: false, lines });
    setBusy(false);
  }, [busy, problem, candidate, current, patch]);

  const suggestions = avail.state === "taken" || avail.state === "held" ? avail.suggestions : [];
  const line =
    problem && candidate.length > 0 ? PROBLEM_TEXT[problem] : availabilitySentence(avail);

  /*
   * THE MOCKUP'S CARD — label, one line of help, the box with a live count and
   * a tick, and nothing else until something needs saying.
   *
   * WHAT CAME OUT, 2026-09-07: a three-line paragraph about how handles are
   * claimed, and a permanent "NOT KNOWN — ICEFALL could not read the handle you
   * hold…" note that showed on every demo build and every failed profile read.
   * Both were true and neither belonged on screen before anybody had typed. The
   * button below still says exactly what it is about to do, and the outcome
   * still says exactly what happened — which is where those facts belong.
   *
   * WHAT STAYED, and must: the change is a SERVER CLAIM, so it happens on the
   * button and not on blur, and the warning about old links breaking is shown
   * before the button is pressed rather than after.
   */
  const ok = avail.state === "free" || avail.state === "current" || avail.state === "reclaim";

  return (
    <div>
      <label htmlFor={id} className="block text-[13.5px] font-medium text-snow">
        Username
      </label>
      <p className="mt-0.5 text-[11.5px] text-mist">This will be your unique handle on ICEFALL.</p>

      <div className="relative mt-3 flex items-center gap-1.5 rounded-[12px] border border-hairline-strong bg-slate px-3.5 py-2.5 focus-within:border-azure/50">
        <span className="shrink-0 text-[14px] text-mist-dim">@</span>
        <input
          id={id}
          value={value}
          onChange={(e) => {
            setDraft(normalise(e.target.value));
            setOutcome(null);
          }}
          placeholder="christofis"
          autoComplete="off"
          className="w-full bg-transparent pr-16 text-[14px] text-snow outline-none placeholder:text-mist-dim"
        />
        {ok && changing && (
          <Check
            size={15}
            strokeWidth={2.4}
            className="absolute right-12 text-summit"
            aria-hidden
          />
        )}
        <span className="tnum pointer-events-none absolute right-3 text-[10.5px] text-mist-dim">
          {value.length}/20
        </span>
      </div>

      {line && (
        <p
          className={cn(
            "mt-2 text-[11.5px] leading-relaxed",
            avail.state === "free" || avail.state === "current" || avail.state === "reclaim"
              ? "text-summit"
              : "text-mist",
          )}
        >
          {line}
        </p>
      )}

      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setDraft(s)}
              className="rounded-pill border border-hairline-strong px-3 py-2 text-[12px] text-mist"
            >
              @{s}
            </button>
          ))}
        </div>
      )}

      {changing && !problem && (
        <div className="mt-3 rounded-card border border-hairline-strong bg-slate/40 p-3">
          {/* Shown only once somebody is actually changing it, which is the
              only moment either sentence matters. */}
          <p className="text-[11.5px] leading-relaxed text-mist">
            {promise
              ? changeWarning(current, promise)
              : "ICEFALL is checking what happens to your old handle."}
          </p>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className={cn(SAVE_BUTTON, "w-full disabled:opacity-50")}
          >
            {busy ? "Asking ICEFALL’s server…" : `Change handle to @${candidate}`}
          </button>
        </div>
      )}

      {outcome && (
        <div className="mt-2">
          {outcome.lines.map((l, i) => (
            <p
              key={i}
              className={cn(
                "mt-1 text-[11.5px] leading-relaxed",
                i > 0 ? "text-mist" : outcome.good ? "text-summit" : "text-danger",
              )}
            >
              {l}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The country — a LIVE column, and the reason it needs a picker.
 *
 * `sync.ts` refuses to derive a country from the town somebody typed, and says
 * why in `COUNTRY_IS_NEVER_PARSED`: "Georgia" is a country and a US state,
 * "Vienna" is in Austria and in Virginia, and a guessed code would go on to
 * drive currency and regional filtering — a decision somebody feels without
 * ever having been asked. So the only way this column is ever written is an
 * explicit choice, which is this control.
 *
 * THE CODES ARE THE SAME SHORT LIST THE HANDLE SCREEN OFFERS, deliberately: two
 * surfaces offering different countries for one column is how a person ends up
 * unable to re-pick what they chose at signup. The list is repeated rather than
 * imported because `screens/auth/Handle.tsx` does not export it and belongs to
 * another surface; the NAMES are not repeated — they come from `Intl` through
 * `countryName`, so they arrive in the reader's own language.
 */
// prettier-ignore
const COUNTRY_CODES = [
  "AR", "AT", "AU", "BE", "BO", "BR", "CA", "CH", "CL", "CN", "CZ", "DE", "DK", "EC", "ES", "FI",
  "FR", "GB", "GR", "IE", "IN", "IS", "IT", "JP", "KE", "KG", "MA", "MX", "NL", "NO", "NP", "NZ",
  "PE", "PK", "PL", "PT", "RO", "SE", "SI", "SK", "TZ", "US", "ZA",
];

function CountryField({
  profile,
  tags,
  onSettled,
}: {
  profile: MyProfileState;
  tags: InterestTag[];
  onSettled: () => void;
}) {
  const { sync, send, touch } = useFieldSync("countryCode", onSettled);
  const [draft, setDraft] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);

  const server =
    confirmed ?? (profile.status === "ready" ? profile.profile.countryCode : null) ?? "";
  const value = draft ?? server;

  const options = useMemo(
    () => [
      { value: "", label: "Prefer not to say" },
      ...COUNTRY_CODES.map((code) => ({ value: code, label: countryName(code) ?? code })).sort(
        (a, b) => a.label.localeCompare(b.label),
      ),
    ],
    [],
  );

  const choose = useCallback(
    async (code: string) => {
      setDraft(code);
      touch();
      // A pick IS the explicit act — there is no half-finished country to wait
      // for a blur on, and nothing is typed that could be lost.
      const r = await send({ countryCode: code.length > 0 ? code : null });
      if (r?.state === "saved") setConfirmed(typeof r.stored === "string" ? r.stored : "");
    },
    [send, touch],
  );

  return (
    <div className="border-t border-hairline px-4 py-3.5 first:border-t-0">
      <span className="block text-[11px] uppercase tracking-[0.1em] text-mist-dim">Country</span>
      <Listbox
        label="Country"
        value={value}
        onChange={(v) => void choose(v)}
        placeholder="Prefer not to say"
        options={options}
        className="mt-2"
      />
      <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">
        {value.length === 0
          ? COUNTRY_IS_NEVER_PARSED
          : "Chosen from this list only. ICEFALL never works a country out from the town you typed."}
      </p>
      <SyncNote
        field="countryCode"
        sync={sync}
        tags={tags}
        typed={value.length > 0 ? (countryName(value) ?? value) : ""}
        resting={
          <LiveColumnResting
            profile={profile}
            matches={value === server}
            blank={value.length === 0}
          />
        }
        onSave={() => void choose(value)}
        onRetry={() => void flushProfile()}
      />
    </div>
  );
}

/**
 * The interests picker — the reason the vocabulary is fetched at all.
 *
 * `interests` is a CLOSED list on the server so people can be found by it, and
 * `sync.ts` refuses to guess: "Alpine climbing" matches neither `climbing` nor
 * `mountaineering`, and picking one on somebody's behalf prints a guess on their
 * profile as though they had said it. Without something to tap, the box is a
 * dead end where most of what anybody types is reported as not stored. So the
 * words themselves are on the screen, and the box stays typeable for anybody
 * who prefers it.
 *
 * Tapping a word writes the SERVER'S OWN LABEL into the box, which is the
 * spelling the matcher recognises without a synonym table.
 */
const slugish = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function InterestChips({
  text,
  tags,
  onToggle,
}: {
  text: string;
  tags: InterestTag[];
  onToggle: (label: string) => void;
}) {
  const chosen = new Set(
    text
      .split(",")
      .map((p) => slugish(p))
      .filter(Boolean),
  );
  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      {tags.map((t) => {
        const on = chosen.has(t.slug) || chosen.has(slugish(t.label));
        return (
          <button
            key={t.slug}
            type="button"
            onClick={() => onToggle(t.label)}
            aria-pressed={on}
            className={cn(
              "rounded-pill border px-3 py-2 text-[12px] transition-colors",
              on
                ? "border-azure/55 bg-azure/[0.12] text-azure"
                : "border-hairline-strong text-mist hover:text-snow",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Tap the photo to change it.
 *
 * IT NOW LEAVES THE PHONE — or says why it did not. `sync.ts` uploads the data
 * URL that `lib/image.ts` produced into the `profile-media` bucket and writes
 * the resulting URL to `avatar_url`, which is a LIVE column; the bucket is the
 * part that may not exist yet, and the difference is reported rather than
 * flattened. The local copy is kept regardless: it is what the app draws
 * offline, and it is why the picture appears the instant it is chosen.
 *
 * AND THE PERSON NOW CHOOSES THE CROP. Tapping the face opens `PhotoAdjuster`
 * before anything is uploaded, so the head is where they put it rather than
 * where a centre-crop happened to leave it. "The instant it is chosen" above
 * still holds — it now means the instant they confirm the framing, and until
 * they do, nothing local or remote has changed at all.
 */
/**
 * THE COVER AND THE FACE — design 3, chosen by the owner on 2026-09-07 from the
 * six mock-ups in `dev/ProfileEditOptions.tsx`: "3 looks good".
 *
 * A banner across the top with its own camera control, the avatar overlapping
 * its lower-left corner with a camera badge of its own, and nothing else. It is
 * the arrangement of the owner's first mockup and it is the right one for this
 * screen for a reason beyond taste: these two controls edit the two things a
 * profile shows AS a header, so editing them in that shape means you are
 * looking at what you are changing.
 *
 * ── WHAT REPLACED WHAT ───────────────────────────────────────────────────────
 *
 * `AvatarPicker` was a row: a circle, then a paragraph explaining that tapping
 * it chooses a photo, then two pill buttons, then a two-line note about whether
 * the server holds one. Four blocks of copy for one control. The camera badge
 * says all of it, and the honest part — whether the photograph reached the
 * server — is still said, once, by `SyncNote` when there is something to say.
 *
 * ── TWO FIELDS, TWO SYNC HOOKS, ONE HEADER ───────────────────────────────────
 *
 * `avatar` is a LIVE column (`profiles.avatar_url`) and `banner` is a PENDING
 * one (`banner_url`, from 20260903020000). They go to the server in different
 * requests and can therefore succeed and fail independently — so they have
 * separate hooks and separate notes, and a banner that could not be stored
 * must never make the avatar look as though it failed too.
 *
 * ── LOCAL FIRST, ALWAYS ──────────────────────────────────────────────────────
 *
 * Both writers `patch()` the phone before they `send()`. The picture is on
 * screen the instant it is chosen and stays there whatever the upload does,
 * which is the behaviour somebody on a mountain with no signal needs.
 */
function PhotoHeader({
  deployment,
  tags,
  onSettled,
}: {
  deployment: Deployment;
  tags: InterestTag[];
  onSettled: () => void;
}) {
  const { user } = useApp();
  const { settings, patch } = useSettings();

  const avatar = useFieldSync("avatar", onSettled);
  const banner = useFieldSync("banner", onSettled);

  const avatarInput = useRef<HTMLInputElement | null>(null);
  const bannerInput = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
   * THE PHOTOGRAPH THEY PICKED, NOT YET THE PHOTOGRAPH THEY HAVE.
   *
   * Choosing a file used to be the whole act: `readAvatar` took the middle
   * square and the upload started. A phone photo of a person is portrait, so
   * the middle square is a chest — and there was no control to say otherwise,
   * only "shoot it again". So the chosen file waits here while `PhotoAdjuster`
   * is open, and NOTHING is patched or sent until they confirm. That is what
   * makes Cancel free: the profile has not been touched, so there is nothing
   * to put back.
   */
  const [adjusting, setAdjusting] = useState<File | null>(null);

  const photo = settings.avatar;
  const cover = settings.cover;

  /*
   * The server side of choosing an avatar, unchanged and deliberately separate
   * from where the picture came from. It patches the phone first and sends
   * second — see the header note — and it now takes a data URL rather than a
   * file, because the adjuster has already done the decoding, cropping and
   * encoding that `readAvatar` used to do on the way past.
   */
  async function commitAvatar(data: string) {
    setAdjusting(null);
    setError(null);
    patch({ avatar: data });
    avatar.touch();
    await avatar.send({ avatar: data });
  }

  async function chooseBanner(file: File | undefined) {
    if (!file) return;
    setError(null);
    let data: string;
    try {
      data = await readBanner(file);
    } catch (e) {
      setError((e as { message?: string }).message ?? "That image couldn't be used.");
      return;
    }
    patch({ cover: data });
    banner.touch();
    await banner.send({ banner: data });
  }

  return (
    <div>
      {/* ---- The cover -------------------------------------------------- */}
      <div className="relative -mx-5 h-32 overflow-hidden bg-slate">
        {cover !== undefined && (
          <img src={cover} alt="" aria-hidden className="h-full w-full object-cover" />
        )}
        {/* A ground under the avatar even when there is no cover, so the face
            does not sit on a hard seam. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-obsidian"
        />
        <button
          type="button"
          onClick={() => bannerInput.current?.click()}
          aria-label={cover !== undefined ? "Change cover photo" : "Add a cover photo"}
          className="absolute right-4 top-3 grid h-9 w-9 place-items-center rounded-full border border-hairline-strong bg-obsidian/70 text-snow backdrop-blur transition-colors hover:border-azure/50"
        >
          <Camera size={15} strokeWidth={1.8} aria-hidden />
        </button>
      </div>

      {/* ---- The face, overlapping it ------------------------------------ */}
      <div className="relative -mt-9 flex items-end gap-3">
        <button
          type="button"
          onClick={() => avatarInput.current?.click()}
          aria-label={photo ? "Change profile photo" : "Add a profile photo"}
          className="relative shrink-0 rounded-full"
        >
          <span className="grid h-[76px] w-[76px] place-items-center overflow-hidden rounded-full border-[3px] border-obsidian bg-slate text-[24px] text-mist">
            {photo ? (
              <img src={photo} alt="" aria-hidden className="h-full w-full object-cover" />
            ) : (
              (user.name ?? "A").slice(0, 1).toUpperCase()
            )}
          </span>
          <span className="absolute bottom-0 right-0 grid h-7 w-7 place-items-center rounded-full border-2 border-obsidian bg-azure text-obsidian">
            <Camera size={13} strokeWidth={2.1} aria-hidden />
          </span>
        </button>

        {(photo !== undefined || cover !== undefined) && (
          <button
            type="button"
            onClick={() => {
              if (photo !== undefined) {
                patch({ avatar: undefined });
                avatar.touch();
                void avatar.send({ avatar: null });
              }
              if (cover !== undefined) {
                patch({ cover: undefined });
                banner.touch();
                void banner.send({ banner: null });
              }
            }}
            className="pb-1.5 text-[12px] text-mist transition-colors hover:text-snow"
          >
            Remove
          </button>
        )}
      </div>

      <input
        ref={avatarInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared straight away so picking the SAME file twice — which is
          // exactly what somebody does after cancelling the adjuster — still
          // fires a change event.
          e.target.value = "";
          if (!file) return;
          setError(null);
          setAdjusting(file);
        }}
      />
      <input
        ref={bannerInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void chooseBanner(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {/*
        THE ADJUST STEP, AND ONLY FOR THE FACE.
        
        `PhotoAdjuster` takes its mask, aspect and output size as arguments
        precisely so the banner could use it too — the banner has the same
        problem in the other direction, since `readBanner` guesses a quarter
        down the frame on the theory that summits sit high in a photograph.
        THE BANNER IS DELIBERATELY NOT WIRED YET: it is a second gesture
        surface to test on a real phone, and shipping it untested alongside
        the avatar would risk both rather than one. It is a prop change, not a
        rewrite, when the owner has tried this one.
        
        `AVATAR_PX` rather than a number typed here: `lib/image.ts` owns the
        stored size, because it also owns the localStorage budget that size is
        chosen against.
      */}
      {adjusting !== null && (
        <PhotoAdjuster
          file={adjusting}
          title="Position your photo"
          mask="circle"
          aspect={1}
          outputWidth={AVATAR_PX}
          confirmLabel="Use photo"
          onCancel={() => setAdjusting(null)}
          onConfirm={(data) => void commitAvatar(data)}
        />
      )}

      {error && <p className="mt-2 text-[11.5px] text-danger">{error}</p>}

      {/*
        ONE NOTE FOR TWO PICTURES, AND NONE AT ALL WITHOUT A SERVER.
        
        This drew a `SyncNote` for the avatar and another for the banner. On a
        build with no backend both said the identical sentence — "This build of
        ICEFALL is not connected to a server…" — one under the other, each with
        its own "Try again" button that could not possibly work. The owner saw
        it and asked what it was: "and whats all this about?". Fair.
        
        Two rules came out of it, and they apply to every sync note on this
        screen:
        
          1. NEVER THE SAME SENTENCE TWICE. The avatar and the banner fail
             together far more often than separately, so one note covers both
             and the second is only drawn when it genuinely differs.
          2. NO RETRY WITHOUT SOMETHING TO RETRY. With no client there is no
             request to repeat — `notifications/social.ts` learned this and
             calls it `canRetry`. Here it is simpler: with no backend the whole
             note goes, because "saved on this phone" is the normal, permanent
             and unremarkable state of this build rather than news.
      */}
      {isBackendConfigured() && (
        <>
          <SyncNote
            field="avatar"
            sync={avatar.sync}
            tags={tags}
            onSave={() => void avatar.send({ avatar: settings.avatar ?? null })}
            onRetry={() => void avatar.send({ avatar: settings.avatar ?? null })}
          />
          {/* Only when it is saying something the avatar's note did not. */}
          {banner.sync.kind !== avatar.sync.kind && (
            <SyncNote
              field="banner"
              sync={banner.sync}
              tags={tags}
              onSave={() => void banner.send({ banner: settings.cover ?? null })}
              onRetry={() => void banner.send({ banner: settings.cover ?? null })}
            />
          )}
          {/* The storage bucket ships in the same migration as the columns and
              can be skipped independently, so a photograph is gated on it. */}
          {deployment.state === "absent" && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">
              Photographs stay on this phone for now — ICEFALL’s server has nowhere to put them yet.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The five social accounts, and the address each handle becomes.
 *
 * ONE TABLE so the form, the profile page and the migration cannot disagree
 * about which platforms exist. `href` is what turns a stored HANDLE into a
 * link — the column never holds a URL, deliberately (see
 * `20260907090000_profile_links.sql`), so this is the only place an address is
 * built and the only place to audit.
 *
 * ICONS: lucide has marks for Instagram, Facebook and YouTube. It has none for
 * TikTok or Strava, so those take neutral glyphs rather than a lookalike —
 * drawing an approximation of somebody's trademark is worse than not drawing
 * one, and the owner's mockup uses each platform's real full-colour logo, which
 * ICEFALL has no licence to ship (`strip-local-assets.mjs` exists because that
 * line has been crossed before).
 */
export const SOCIALS = [
  {
    id: "instagram" as const,
    label: "Instagram",
    icon: Instagram,
    placeholder: "yourhandle",
    href: (h: string) => `https://instagram.com/${encodeURIComponent(h)}`,
  },
  {
    id: "strava" as const,
    label: "Strava",
    icon: Activity,
    placeholder: "yourhandle",
    href: (h: string) => `https://strava.com/athletes/${encodeURIComponent(h)}`,
  },
  {
    id: "youtube" as const,
    label: "YouTube",
    icon: Youtube,
    placeholder: "yourchannel",
    href: (h: string) => `https://youtube.com/@${encodeURIComponent(h)}`,
  },
  {
    id: "tiktok" as const,
    label: "TikTok",
    icon: Music2,
    placeholder: "yourhandle",
    href: (h: string) => `https://tiktok.com/@${encodeURIComponent(h)}`,
  },
  {
    id: "facebook" as const,
    label: "Facebook",
    icon: Facebook,
    placeholder: "yourpage",
    href: (h: string) => `https://facebook.com/${encodeURIComponent(h)}`,
  },
];

/**
 * ONE FIELD, THE WAY THE OWNER'S MOCKUP DRAWS IT — a card holding a label, a
 * one-line explanation, the box, and a character count in its corner.
 *
 * The count is the mockup's "10/50". It is a real limit in every case: 80 for a
 * display name and 300 for a bio are what `profiles`' own CHECK constraints
 * allow, so the number is measured rather than a design flourish. It turns red
 * at the limit rather than silently truncating.
 */
function MockField({
  label,
  help,
  value,
  onChange,
  onCommit,
  max,
  placeholder,
  multiline,
  prefix,
  children,
}: {
  label: string;
  help?: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  max: number;
  placeholder?: string;
  multiline?: boolean;
  prefix?: string;
  children?: React.ReactNode;
}) {
  const id = useId();
  const over = value.length > max;
  /*
   * NO CARD AROUND THE FIELD. The owner, 2026-09-07: "dont have everything in
   * damn boxes I said, remove all boxes keep the data you change in boxes like
   * the acc username".
   *
   * So exactly one box per field, and it is the box you type in. The label and
   * the line of help sit on the page above it. What was here was a bordered
   * card wrapping a label, a help line AND an input box — a box inside a box,
   * which is what made the screen read as a stack of panels.
   */
  return (
    <div>
      <label htmlFor={id} className="block text-[13.5px] font-medium text-snow">
        {label}
      </label>
      {help !== undefined && <p className="mt-0.5 text-[11.5px] text-mist">{help}</p>}
      <div className="relative mt-3 rounded-[12px] border border-hairline-strong bg-slate px-3.5 py-2.5 focus-within:border-azure/50">
        <div className="flex items-start gap-1.5">
          {prefix !== undefined && (
            <span className="shrink-0 pt-[1px] text-[14px] text-mist-dim">{prefix}</span>
          )}
          {multiline ? (
            <textarea
              id={id}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onBlur={onCommit}
              placeholder={placeholder}
              rows={4}
              className="w-full resize-none bg-transparent pr-12 text-[14px] leading-relaxed text-snow outline-none placeholder:text-mist-dim"
            />
          ) : (
            <input
              id={id}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onBlur={onCommit}
              placeholder={placeholder}
              className="w-full bg-transparent pr-12 text-[14px] text-snow outline-none placeholder:text-mist-dim"
            />
          )}
        </div>
        <span
          className={cn(
            "tnum pointer-events-none absolute bottom-2 right-3 text-[10.5px]",
            over ? "text-danger" : "text-mist-dim",
          )}
        >
          {value.length}/{max}
        </span>
      </div>
      {children}
    </div>
  );
}

const FIELD_LABEL: Record<ProfileFieldName, string> = {
  displayName: "Display name",
  region: "Town or region",
  countryCode: "Country",
  bio: "Bio",
  languages: "Languages",
  interests: "Interests",
  avatar: "Profile photo",
  banner: "Profile banner",
  website: "Website",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
  strava: "Strava",
};

/**
 * What is still sitting on this phone waiting to go.
 *
 * `sync.ts` never drains its outbox on a timer, at startup or on reconnect —
 * only after a save the server has just proved it will take, and through this
 * control, which is a person choosing. So the queue has to be visible, or an
 * edit made in a hut waits for a save that nobody makes.
 *
 * It names the fields and the day, because "something did not save" that will
 * not say WHAT is the kind of warning people learn to scroll past.
 */
function WaitingToSend({
  pending,
  onSettled,
  tags,
}: {
  pending: NonNullable<ReturnType<typeof pendingProfileEdit>>;
  onSettled: () => void;
  tags: InterestTag[];
}) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<SaveProfileResult | null>(null);

  const fields = (Object.keys(pending) as (keyof typeof pending)[])
    .filter((k): k is ProfileFieldName => k !== "at")
    .map((k) => FIELD_LABEL[k]);

  return (
    <div className="px-4 py-3.5">
      <p className="text-[13.5px] text-snow">
        {fields.length === 1
          ? "One edit is on this phone and has not reached ICEFALL."
          : `${fields.length} edits are on this phone and have not reached ICEFALL.`}
      </p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-mist-dim">
        {fields.join(", ")} — edited {fmtDate(pending.at)}. Nothing is lost, and nobody else can see
        it yet.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await flushProfile();
          setReport(r);
          setBusy(false);
          onSettled();
        }}
        className={cn(SAVE_BUTTON, "disabled:opacity-50")}
      >
        {busy ? "Sending…" : "Try to send now"}
      </button>

      {/* A flush is reported per field for the same reason a save is: it can
          take the name and leave the bio behind, and one line for both would be
          wrong about one of them. */}
      {report &&
        (Object.keys(report.fields) as ProfileFieldName[]).map((key) => {
          const r = report.fields[key];
          if (!r) return null;
          const echo = r.state === "saved" ? storedText(key, r.stored ?? null, tags) : null;
          return (
            <div key={key}>
              <SyncLine
                tone={SYNC_TONE[r.state]}
                word={`${FIELD_LABEL[key]} — ${SYNC_WORD[r.state]}`}
              >
                {r.message}
              </SyncLine>
              {echo !== null && (
                <p className="mt-1 text-[11px] leading-relaxed text-mist-dim">
                  Other climbers see it as “{echo}”.
                </p>
              )}
            </div>
          );
        })}
    </div>
  );
}

/** The mockup's three tabs, in its order. */
const TABS = [
  { id: "profile" as const, label: "Profile" },
  { id: "links" as const, label: "Links & Social" },
  { id: "settings" as const, label: "Settings" },
];

/**
 * EACH PLATFORM'S OWN COLOUR, on a tile carrying lucide's outline glyph.
 *
 * The mockup uses the real full-colour logos. ICEFALL has no licence to ship
 * third-party trademarks and this repo strips them out of every build on
 * purpose (`scripts/strip-local-assets.mjs` exists because that line was
 * crossed once already). A brand-coloured tile with our own glyph is as close
 * as this can honestly get, and it reads the same at 36px.
 */
const BRAND: Record<string, string> = {
  instagram: "linear-gradient(135deg, #F58529, #DD2A7B 55%, #8134AF)",
  strava: "#FC4C02",
  youtube: "#FF0000",
  tiktok: "#111114",
  facebook: "#1877F2",
};

function EditProfile() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("profile");
  const { user } = useApp();
  const { settings, patch } = useSettings();
  const profile = useMyProfile();
  const deployment = useProfileColumns();
  const tags = deployment.state === "ready" ? deployment.tags : [];

  const [pending, setPending] = useState(() => pendingProfileEdit());
  const onSettled = useCallback(() => setPending(pendingProfileEdit()), []);

  const bio = useFieldSync("bio", onSettled);
  const region = useFieldSync("region", onSettled);
  const languages = useFieldSync("languages", onSettled);
  const interests = useFieldSync("interests", onSettled);
  /* The links — `20260907090000_profile_links.sql`. Same machinery as every
     other field: patch the phone on each keystroke, send on blur. */
  const website = useFieldSync("website", onSettled);
  const instagram = useFieldSync("instagram", onSettled);
  const facebook = useFieldSync("facebook", onSettled);
  const youtube = useFieldSync("youtube", onSettled);
  const tiktok = useFieldSync("tiktok", onSettled);
  const strava = useFieldSync("strava", onSettled);

  const serverRegion = profile.status === "ready" ? profile.profile.locationLabel : null;
  const [regionConfirmed, setRegionConfirmed] = useState<string | null>(null);
  const regionBase = regionConfirmed ?? serverRegion ?? "";

  /* Every text field keeps the same shape: patch() the phone on every
     keystroke, and send to the server when the box is left. The two are not
     alternatives — the first is why this works with no signal, the second is
     why anybody else ever sees it.

     A COMMIT ONLY FIRES ON A BOX SOMEBODY TOUCHED. Blur runs whenever focus
     moves, so committing unconditionally would send the bio to the server
     because a person tapped through the form on their way to the photo, and
     would then hang a status line under a field nobody edited. */
  const commitRegion = useCallback(async () => {
    if (region.sync.kind !== "unsent") return;
    if (tidy(settings.region) === tidy(regionBase)) {
      region.reset();
      return;
    }
    const r = await region.send({ region: settings.region });
    if (r?.state === "saved") {
      const held = typeof r.stored === "string" ? r.stored : "";
      setRegionConfirmed(held);
      // The server trims and collapses. Mirroring what it actually holds back
      // into the phone stops the two drifting a space apart and calling that a
      // pending edit forever.
      patch({ region: held });
    }
  }, [patch, region, regionBase, settings.region]);

  const commitBio = useCallback(() => {
    if (bio.sync.kind === "unsent") void bio.send({ bio: settings.bio });
  }, [bio, settings.bio]);
  const commitLanguages = useCallback(() => {
    if (languages.sync.kind === "unsent") void languages.send({ languages: settings.languages });
  }, [languages, settings.languages]);
  const commitInterests = useCallback(() => {
    if (interests.sync.kind === "unsent") void interests.send({ interests: settings.interests });
  }, [interests, settings.interests]);

  const commitWebsite = useCallback(() => {
    if (website.sync.kind === "unsent") void website.send({ website: settings.website });
  }, [website, settings.website]);
  const commitInstagram = useCallback(() => {
    if (instagram.sync.kind === "unsent") void instagram.send({ instagram: settings.instagram });
  }, [instagram, settings.instagram]);
  const commitFacebook = useCallback(() => {
    if (facebook.sync.kind === "unsent") void facebook.send({ facebook: settings.facebook });
  }, [facebook, settings.facebook]);
  const commitYoutube = useCallback(() => {
    if (youtube.sync.kind === "unsent") void youtube.send({ youtube: settings.youtube });
  }, [youtube, settings.youtube]);
  const commitTiktok = useCallback(() => {
    if (tiktok.sync.kind === "unsent") void tiktok.send({ tiktok: settings.tiktok });
  }, [tiktok, settings.tiktok]);
  const commitStrava = useCallback(() => {
    if (strava.sync.kind === "unsent") void strava.send({ strava: settings.strava });
  }, [strava, settings.strava]);

  /*
   * SAVE CHANGES — the mockup's button, and it does not replace the blur-save.
   *
   * Both mockups end on a full-width Save, so there is one. What it does NOT do
   * is become the only way to save: every box still sends when it is left, and
   * the outbox still flushes on the way out, because a form that only saves on
   * a button loses everything to a swipe-back with the keyboard open. This is
   * the same flush as leaving, fired deliberately — so the button is honest
   * ("send what has not been sent") rather than decorative.
   */
  /*
   * IS THERE ANYTHING TO SAVE?
   *
   * The owner, 2026-09-07: "save changes button appears only after they made a
   * change, not just be available for whenever common sense". Right — a Save
   * that is always there is a button that usually does nothing, and a control
   * that does nothing when pressed teaches people not to trust the ones that do.
   *
   * WHAT COUNTS AS A CHANGE. `sync.kind === "unsent"` is the field's own word
   * for "typed and not yet sent", set by `touch()` on every keystroke and
   * cleared when the server answers. The outbox counts too: an edit that FAILED
   * to send is still unsaved, and Save is exactly the control that should retry
   * it. `> 1` because every outbox entry carries an `at` timestamp of its own.
   *
   * PHOTOS ARE DELIBERATELY NOT IN HERE. Choosing one uploads it immediately —
   * there is no moment where a picture is picked and unsaved — so counting them
   * would make the button appear and never have anything to do.
   */
  const [nameDirty, setNameDirty] = useState(false);
  const unsaved =
    nameDirty ||
    [bio, region, languages, interests, website, instagram, facebook, youtube, tiktok, strava].some(
      (f) => f.sync.kind === "unsent",
    ) ||
    /*
     * THE OUTBOX COUNTS ONLY WHERE IT CAN DRAIN.
     *
     * A failed edit is genuinely unsaved and Save is the right control to retry
     * it — on a build that has a server. On one that does not, every edit ever
     * made lands in the outbox and stays there, so counting it would pin the
     * button on screen permanently with nothing it could ever accomplish. That
     * is the exact "button available for whenever" this change exists to
     * remove, arrived at from the other direction.
     */
    (isBackendConfigured() && pending !== null && Object.keys(pending).length > 1);

  const saveAll = useCallback(() => {
    void flushProfile();
    commitBio();
    commitLanguages();
    commitInterests();
    void commitRegion();
    commitWebsite();
    commitInstagram();
    commitFacebook();
    commitYoutube();
    commitTiktok();
    commitStrava();
  }, [
    commitBio,
    commitLanguages,
    commitInterests,
    commitRegion,
    commitWebsite,
    commitInstagram,
    commitFacebook,
    commitYoutube,
    commitTiktok,
    commitStrava,
  ]);

  /*
    ANYTHING LEFT UNSENT WHEN THE SCREEN CLOSES GOES ON THE WAY OUT.

    Blur covers a tap on anything else, including the back arrow. It does not
    cover a swipe-back with the keyboard open, and losing a bio to a gesture is
    not acceptable. Fire and forget, deliberately: the screen is gone, so
    nothing is claimed on it, and a send that fails is kept in `sync.ts`'s
    outbox and shown as waiting the next time this screen opens.
  */
  const leaving = useRef<ProfileEdit>({});
  leaving.current = {
    ...(bio.sync.kind === "unsent" ? { bio: settings.bio } : {}),
    ...(languages.sync.kind === "unsent" ? { languages: settings.languages } : {}),
    ...(interests.sync.kind === "unsent" ? { interests: settings.interests } : {}),
    ...(region.sync.kind === "unsent" && tidy(settings.region) !== tidy(regionBase)
      ? { region: settings.region }
      : {}),
    ...(website.sync.kind === "unsent" ? { website: settings.website } : {}),
    ...(instagram.sync.kind === "unsent" ? { instagram: settings.instagram } : {}),
    ...(facebook.sync.kind === "unsent" ? { facebook: settings.facebook } : {}),
    ...(youtube.sync.kind === "unsent" ? { youtube: settings.youtube } : {}),
    ...(tiktok.sync.kind === "unsent" ? { tiktok: settings.tiktok } : {}),
    ...(strava.sync.kind === "unsent" ? { strava: settings.strava } : {}),
  };
  useEffect(
    () => () => {
      if (Object.keys(leaving.current).length > 0) void saveProfile(leaving.current);
    },
    [],
  );

  /*
   * BUILT 1:1 TO THE OWNER'S MOCKUP, 2026-09-07 — the two-screen drawing with a
   * tab strip, a banner card, an overlapping avatar, and cards carrying a
   * label, a one-line explanation, an input and a character count.
   *
   * "use same colours, same buttons same everything", then, a minute later,
   * "not the gold, replace with our blue". So: the LAYOUT is the mockup exactly
   * and the ACCENT is ICEFALL's azure. That is the one deliberate departure and
   * it is the owner's own call — a gold Save button would also have collided
   * with `--ice-gilt`, which this app reserves for "somebody is selling you
   * this".
   *
   * THREE TABS, as drawn: Profile · Links & Social · Settings.
   *
   * WHERE THE MOCKUP AND THIS APP DISAGREE, AND WHAT WON:
   *
   *   · "Connected" — the drawing shows every social row with a green
   *     "Connected" and a chevron, which is OAuth. ICEFALL has no OAuth with
   *     any of these platforms and cannot verify that an account is yours. So a
   *     row shows the handle you typed, and says nothing about connection. A
   *     green "Connected" against a handle somebody typed is the plainest
   *     possible false claim.
   *   · BRAND LOGOS — the drawing uses each platform's full-colour mark.
   *     ICEFALL has no licence to ship those, and this repo strips
   *     third-party trademarks out of every build on purpose
   *     (`scripts/strip-local-assets.mjs`). The tiles use each brand's COLOUR
   *     with lucide's own outline glyph, which is the closest thing that is
   *     ours to ship.
   *   · PROFILE VISIBILITY — drawn as a working control. The setting exists and
   *     is stored, but there is no policy behind it on the server: every
   *     signed-in account can read every profile today. It is shown, and the
   *     one line under it says so, because a control that silently does nothing
   *     is worse than one that admits it.
   */
  return (
    /*
     * THE OPENING — the owner, 2026-09-07: "make it when you click on it its an
     * animation opening the page".
     *
     * The screen rises and scales up from just under full size, so it reads as
     * the page opening OUT of the button that was tapped rather than sliding in
     * from somewhere. `transformOrigin` at the top keeps the header still while
     * the body expands, which is what makes it feel like an opening rather than
     * a zoom.
     *
     * IT IS ON TOP OF the shell's own cross-fade, not instead of it — that fade
     * is what every screen change does and removing it here would make this one
     * arrive differently from everything else in the app.
     *
     * `useReducedMotion` is honoured: with it set, the screen simply appears.
     * A scale-up is exactly the kind of movement that setting exists to stop.
     */
    <motion.div
      initial={reduce ? false : { opacity: 0, scale: 0.965, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      style={{ transformOrigin: "50% 12%", paddingBottom: TABBAR_CLEAR }}
      className="no-scrollbar h-full overflow-y-auto px-5"
    >
      {/* ---- Header ------------------------------------------------------ */}
      <div className="flex items-start gap-3 pt-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="mt-0.5 shrink-0 text-mist transition-colors hover:text-snow"
        >
          <ChevronLeft size={22} strokeWidth={1.8} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-medium leading-tight text-snow">Edit Profile</h1>
          <p className="mt-1 text-[12px] leading-snug text-mist">
            Update your profile, banner and how you appear on ICEFALL.
          </p>
        </div>
        {/* Only when there is something to send — see `unsaved` above. */}
        {unsaved && (
          <Button size="sm" className="shrink-0 rounded-pill px-4" onClick={saveAll}>
            Save changes
          </Button>
        )}
      </div>

      {/* ---- Tabs -------------------------------------------------------- */}
      <div className="mt-4 flex items-center gap-6 border-b border-hairline">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px border-b-2 pb-2.5 text-[13.5px] transition-colors",
              tab === t.id
                ? "border-azure font-medium text-azure"
                : "border-transparent text-mist hover:text-snow",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ================================================================== */}
      {tab === "profile" && (
        <div className="space-y-6 pt-5">
          <PhotoHeader deployment={deployment} tags={tags} onSettled={onSettled} />

          <NameField profile={profile} tags={tags} onSettled={onSettled} onDirty={setNameDirty} />

          <HandleField profile={profile} />

          <MockField
            label="Bio"
            help="Tell the community about yourself. Your bio will appear on your profile."
            value={settings.bio}
            onChange={(v) => {
              patch({ bio: v });
              bio.touch();
            }}
            onCommit={commitBio}
            max={300}
            multiline
            placeholder="Mountaineer | Nepal"
          >
            <SyncNote
              field="bio"
              sync={bio.sync}
              tags={tags}
              onSave={commitBio}
              onRetry={() => void flushProfile()}
            />
          </MockField>
        </div>
      )}

      {/* ================================================================== */}
      {tab === "links" && (
        <div className="space-y-6 pt-5">
          {/* ---- Bio links ------------------------------------------------ */}
          <div>
            <h2 className="text-[16px] font-medium text-snow">Bio Links</h2>
            <p className="mt-0.5 text-[12px] text-mist">
              Add a link to your website, blog or other profiles.
            </p>
            <div className="mt-3">
              <MockField
                label="Website"
                value={settings.website}
                onChange={(v) => {
                  patch({ website: v });
                  website.touch();
                }}
                onCommit={commitWebsite}
                max={200}
                prefix="https://"
                placeholder="yoursite.com"
              >
                <SyncNote
                  field="website"
                  sync={website.sync}
                  tags={tags}
                  onSave={commitWebsite}
                  onRetry={() => void flushProfile()}
                />
              </MockField>
            </div>
          </div>

          {/* ---- Social accounts ------------------------------------------ */}
          <div>
            <h2 className="text-[16px] font-medium text-snow">Social Media Links</h2>
            <p className="mt-0.5 text-[12px] text-mist">
              Your handles. ICEFALL builds the address and does not check the account is yours.
            </p>
            <div className="mt-3">
              {SOCIALS.map((sc) => {
                const st = {
                  instagram: { s: instagram, c: commitInstagram },
                  strava: { s: strava, c: commitStrava },
                  youtube: { s: youtube, c: commitYoutube },
                  tiktok: { s: tiktok, c: commitTiktok },
                  facebook: { s: facebook, c: commitFacebook },
                }[sc.id];
                return (
                  <div key={sc.id} className="py-3 first:pt-0">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-white"
                        style={{ background: BRAND[sc.id] }}
                      >
                        <sc.icon size={17} strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] text-snow">{sc.label}</span>
                        <span className="mt-1 flex items-center gap-1">
                          <span className="text-[13px] text-mist-dim">@</span>
                          <input
                            value={settings[sc.id]}
                            onChange={(e) => {
                              patch({ [sc.id]: e.target.value });
                              st.s.touch();
                            }}
                            onBlur={st.c}
                            placeholder={sc.placeholder}
                            aria-label={`${sc.label} handle`}
                            className="w-full bg-transparent text-[13px] text-snow outline-none placeholder:text-mist-dim"
                          />
                        </span>
                      </span>
                      {settings[sc.id].trim().length > 0 && (
                        <button
                          type="button"
                          aria-label={`Remove ${sc.label}`}
                          onClick={() => {
                            patch({ [sc.id]: "" });
                            st.s.touch();
                            void st.s.send({ [sc.id]: "" } as ProfileEdit);
                          }}
                          className="shrink-0 text-mist-dim transition-colors hover:text-snow"
                        >
                          <X size={16} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                    <SyncNote
                      field={sc.id}
                      sync={st.s.sync}
                      tags={tags}
                      onSave={st.c}
                      onRetry={() => void flushProfile()}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* ---- Visibility ------------------------------------------------ */}
          <div>
            <h2 className="text-[16px] font-medium text-snow">Profile Visibility</h2>
            <p className="mt-0.5 text-[12px] text-mist">Choose who can see your profile.</p>
            <div className="mt-3 flex items-center gap-3 rounded-[12px] border border-hairline-strong bg-slate px-3.5 py-2.5">
              <Globe size={17} strokeWidth={1.7} className="shrink-0 text-mist" aria-hidden />
              <span className="flex-1 text-[14px] text-snow">
                {settings.profileVisibility === "private" ? "Private" : "Connections"}
              </span>
            </div>
            {/* The one line that stops this being a lie. */}
            <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">
              Not enforced yet — every signed-in ICEFALL account can currently read every profile,
              whatever this says.
            </p>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* THE ONE SENTENCE. With no server the per-field notes say nothing, so
          this is the only place the build's condition is stated — once. */}
      {!isBackendConfigured() && (
        <p className="pt-5 text-[11px] leading-relaxed text-mist-dim">
          This build is not connected to a server, so your profile is saved on this phone and
          nowhere else.
        </p>
      )}

      {tab === "settings" && (
        <div className="space-y-6 pt-5">
          <MockField
            label="Town or region"
            help="A town or region. Never an address."
            value={settings.region}
            onChange={(v) => {
              patch({ region: v });
              region.touch();
            }}
            onCommit={() => void commitRegion()}
            max={80}
            placeholder="Chamonix"
          >
            <SyncNote
              field="region"
              sync={region.sync}
              tags={tags}
              onSave={() => void commitRegion()}
              onRetry={() => void flushProfile()}
            />
          </MockField>

          <CountryField profile={profile} tags={tags} onSettled={onSettled} />

          <MockField
            label="Languages"
            help="Written as you like — ICEFALL stores them as language codes."
            value={settings.languages}
            onChange={(v) => {
              patch({ languages: v });
              languages.touch();
            }}
            onCommit={commitLanguages}
            max={120}
            placeholder="English, French"
          >
            <SyncNote
              field="languages"
              sync={languages.sync}
              tags={tags}
              onSave={commitLanguages}
              onRetry={() => void flushProfile()}
            />
          </MockField>

          <MockField
            label="Interests"
            help="Chosen from a fixed list so people can be found by them."
            value={settings.interests}
            onChange={(v) => {
              patch({ interests: v });
              interests.touch();
            }}
            onCommit={commitInterests}
            max={200}
            placeholder="Ski touring, mountaineering"
          >
            {tags.length > 0 && (
              <InterestChips
                text={settings.interests}
                tags={tags}
                onToggle={(label) => {
                  const parts = settings.interests
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean);
                  const at = parts.findIndex((x) => slugish(x) === slugish(label));
                  if (at >= 0) parts.splice(at, 1);
                  else parts.push(label);
                  patch({ interests: parts.join(", ") });
                  interests.touch();
                }}
              />
            )}
            <SyncNote
              field="interests"
              sync={interests.sync}
              tags={tags}
              onSave={commitInterests}
              onRetry={() => void flushProfile()}
            />
          </MockField>

          {/* `> 1` because every entry carries `at`. */}
          {pending && Object.keys(pending).length > 1 && (
            <div>
              <p className="text-[13.5px] font-medium text-snow">Waiting to send</p>
              <div className="mt-2">
                <WaitingToSend pending={pending} onSettled={onSettled} tags={tags} />
              </div>
            </div>
          )}

          <div className="pt-2">
            <InfoRow
              title="Mountaineering experience"
              detail="Set during onboarding and used by the Coach."
              value={user.experience ?? "—"}
              tone="mist"
            />
            <LinkRow
              to="/settings/cv"
              title="Verified achievements"
              detail="From what you recorded. Not editable by hand."
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}

function ShareProfile() {
  const { user, currentTier } = useApp();
  const { settings, patch } = useSettings();
  const goal = usePrimaryGoal();
  const [copied, setCopied] = useState(false);
  const [nudge, setNudge] = useState(0);

  /**
   * Only badges that have actually been GRANTED travel on a public card.
   * A pending application is not a badge, and a card that showed one would be
   * making a claim to a stranger that ICEFALL has not stood behind.
   */
  const earned = BADGES.filter((b) => badgeState(b, settings, currentTier).kind === "earned");

  /**
   * THE HANDLE ON THE CARD IS THE ONE THE SERVER HOLDS, when the server can be
   * asked.
   *
   * `settings.username` is a local field somebody can type anything into; the
   * handle on `public.profiles` is unique across the platform and claimed
   * atomically, and it is the one that resolves at `/social/people/:handle`.
   * Printing the local one on a card sent to a stranger gives them an address
   * that reaches nobody — which is exactly why `useMyProfile` exists. The local
   * value is still the fallback, because a card has to render with no signal,
   * and the note under the card says which of the two is on it.
   */
  const myProfile = useMyProfile();
  const claimed = myProfile.status === "ready" ? myProfile.profile.username : null;
  const handle =
    claimed ??
    (settings.username || (user.name ?? "athlete").toLowerCase().replace(/[^a-z0-9]/g, ""));

  /**
   * A link that opens something.
   *
   * It used to be `https://icefall.app/@handle`, which resolves to nothing —
   * there is no server that knows who that is. The card now travels inside the
   * link's fragment, so it opens on any device with no account, and the
   * fragment is never sent to a host.
   */
  const shared: SharedProfile = {
    v: 1,
    name: user.name,
    handle,
    bio: settings.bio || undefined,
    region: settings.region || undefined,
    avatar: settings.avatar,
    objective: goal
      ? {
          name: goal.name,
          when: fmtDate(goal.targetDate, { day: undefined }),
          preparationPct: goal.preparation,
        }
      : undefined,
    summits: user.summits.length,
    highestM: user.summits.reduce((m, s2) => Math.max(m, s2.elevationM ?? 0), 0) || undefined,
    badges: earned.map((b) => b.id),
    at: new Date().toISOString(),
  };
  const link = profileLink(shared);
  const banner = bannerFor(handle, nudge);

  return (
    <SettingsPage title="Share profile" subtitle="A card other people can open.">
      <Rise>
        <div className="overflow-hidden rounded-card border border-azure/30 bg-graphite">
          <div className="relative h-[150px]">
            <img
              src={banner}
              alt=""
              aria-hidden
              className="h-full w-full object-cover opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-graphite via-graphite/40 to-transparent" />
            <p className="absolute left-4 top-4 text-[10px] uppercase tracking-[0.3em] text-snow/80">
              Icefall
            </p>
            <button
              type="button"
              onClick={() => setNudge((n) => n + 1)}
              aria-label="Change the banner"
              className="absolute right-3 top-3 flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-obsidian/70 px-2.5 py-1.5 text-[11px] text-snow backdrop-blur"
            >
              <Shuffle size={12} strokeWidth={1.9} />
              {bannerIndex(handle, nudge) + 1}/{PROFILE_BANNERS.length}
            </button>
          </div>
          <div className="-mt-8 px-4 pb-4">
            <p className="text-[22px] font-light text-snow">{user.name ?? "Athlete"}</p>
            <p className="text-[12px] text-mist-dim">@{handle}</p>
            {/* Only GRANTED badges appear on a card that leaves the app —
                a pending application is not a badge. Today that means none. */}
            {earned.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {earned.map((b) => (
                  <span
                    key={b.id}
                    className="flex items-center gap-1.5 rounded-pill border border-hairline-strong py-1 pl-1 pr-2.5"
                  >
                    <BadgeHex badge={b} size={18} />
                    <span className="text-[10.5px] text-snow">{b.name}</span>
                  </span>
                ))}
              </div>
            )}
            {goal && (
              <p className="mt-2 text-[12.5px] text-azure">
                {goal.name} — {fmtDate(goal.targetDate, { day: undefined })}
              </p>
            )}
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-hairline pt-3">
              <Stat label="Preparation" value={goal ? `${Math.round(goal.preparation)}%` : "—"} />
              <Stat label="Summits" value="—" />
              <Stat label="Highest" value="—" />
            </div>
            <p className="mt-2.5 text-[10.5px] leading-relaxed text-mist-dim">
              Summits and altitude come from your Mountain Passport once you have recorded some.
            </p>
          </div>
        </div>
      </Rise>

      {/* Not shown while the read is still in flight — a warning that appears
          for a second and then vanishes teaches people to ignore warnings. */}
      {myProfile.status !== "loading" && claimed === null && (
        <Rise className="pt-4">
          <p className="text-[11.5px] leading-relaxed text-mist-dim">
            ICEFALL has no claimed handle for you — either you have not picked one or it could not
            be read — so the card shows what this phone remembers. It may not be the handle that
            finds you.
          </p>
        </Rise>
      )}

      <Group label="Who can open it">
        <ChoiceRow
          title="Profile visibility"
          detail="Applies to the link and to your profile inside ICEFALL."
          options={VISIBILITY_OPTIONS}
          value={settings.profileVisibility}
          onChange={(v: Visibility) => patch({ profileVisibility: v })}
        />
      </Group>

      <Group label="Share">
        <ActionRow
          title={copied ? "Link copied" : "Copy link"}
          detail="Opens your card on any device — no account needed."
          value={copied ? "Copied" : undefined}
          tone="azure"
          onClick={() => {
            void navigator.clipboard?.writeText(link).catch(() => {});
            setCopied(true);
          }}
        />
        <ActionRow
          title="Share card"
          detail="Send it through your phone's share sheet."
          onClick={() => sharePage(`${user.name} · ICEFALL`, link)}
        />
        <LinkRow
          to={`/p#${encodeProfile(shared)}`}
          title="Preview the card"
          detail="See exactly what other people will open."
        />
      </Group>

      <Rise className="pt-4">
        <Disclaimer>
          The card travels inside the link, so it opens with no account and nothing is sent to a
          server. It is a snapshot rather than a live page — and it carries no contact details, no
          age, and no location beyond the region you set.
        </Disclaimer>
      </Rise>
    </SettingsPage>
  );
}

function Verification() {
  const { settings, applyVerification } = useSettings();
  const { currentTier } = useApp();

  const kinds = [
    {
      id: "identity" as const,
      name: "Identity verified",
      detail: "Confirms you are who you say you are.",
    },
    {
      id: "history" as const,
      name: "Expedition history verified",
      detail: "Confirms the expeditions on your profile happened.",
    },
    {
      id: "professional" as const,
      name: "Professional verified",
      detail: "Confirms a guiding or instructing qualification.",
    },
  ];

  return (
    <SettingsPage title="Verification" subtitle="Have parts of your profile independently checked.">
      <Rise>
        <p className="text-[12.5px] leading-relaxed text-mist">
          Verification helps other ICEFALL members understand which parts of your profile have been
          independently checked. It never says that a person is safe, medically fit, or qualified
          for a particular climb.
        </p>
      </Rise>

      <Group label="Levels">
        {kinds.map((k) => {
          const app = settings.verification[k.id];
          return (
            <div key={k.id} className="border-t border-hairline px-4 py-3.5 first:border-t-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] text-snow">{k.name}</p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-mist-dim">{k.detail}</p>
                </div>
                <StatusPill status={app.status} />
              </div>
              {app.status === "none" && (
                <Button
                  variant="secondary"
                  className="mt-3 w-full"
                  disabled={currentTier === "free"}
                  onClick={() => applyVerification(k.id)}
                >
                  {currentTier === "free" ? "Pro members only" : "Apply for verification"}
                </Button>
              )}
            </div>
          );
        })}
      </Group>

      {currentTier === "free" && (
        <Rise className="pt-4">
          <div className="rounded-card border border-azure/35 bg-azure/[0.05] p-4">
            <p className="text-[13px] text-snow">Verification is a Pro feature.</p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist">
              Reviewing an identity costs real time, so it is reserved for Pro members.
            </p>
            <Link to="/pricing" className="mt-3 inline-block text-[12.5px] text-azure">
              See plans →
            </Link>
          </div>
        </Rise>
      )}

      <Rise className="pt-4">
        <Disclaimer>
          No verification can actually be granted yet — checking an identity needs people and a
          server ICEFALL does not have. Applying records your intent on this device.
        </Disclaimer>
      </Rise>
    </SettingsPage>
  );
}

function PassportSettings() {
  const { settings, patch } = useSettings();
  return (
    <SettingsPage title="Mountain Passport" subtitle="Your own record of what you have climbed.">
      <Group>
        <LinkRow
          to="/profile"
          icon={Award}
          title="Open Passport"
          detail="It lives inside your profile."
        />
        <LinkRow
          to="/settings/cv"
          icon={MountainIcon}
          title="Mountain CV"
          detail="The same record, written as a CV."
        />
      </Group>
      <Group label="Visibility">
        <ChoiceRow
          title="Who can see your Passport"
          options={VISIBILITY_OPTIONS}
          value={settings.passportVisibility}
          onChange={(v: Visibility) => patch({ passportVisibility: v })}
        />
      </Group>
      <Rise className="pt-4">
        <Disclaimer>
          Nothing in the Passport can be edited by hand. Summits, altitude and skills are assembled
          from what you recorded and what you told ICEFALL during onboarding, each labelled with
          where it came from.
        </Disclaimer>
      </Rise>
    </SettingsPage>
  );
}

/* ========================================================================== */
/* Account                                                                    */
/* ========================================================================== */

/**
 * PH-19a — the Account page reads the LIVE SESSION.
 *
 * Every row here was hard-coded "Not set", and the page said in terms *"No
 * account is attached to this device"* and *"there is nothing to sign in to"*.
 * Real auth shipped on 2026-08-30, so a signed-in climber opened Account and
 * was told they had no account — the same stale-apology failure as the support
 * copy that said support did not exist, on the same morning it started working.
 *
 * SIGNED OUT IS STILL A REAL STATE and still says so. The difference is that it
 * is now read rather than assumed, so the page cannot be wrong in either
 * direction.
 */
function Account() {
  const { user } = useApp();
  const [copied, setCopied] = useState(false);
  const id = memberId(user.name ?? "");

  const [session, setSession] = useState<
    { state: "loading" } | { state: "none" } | { state: "in"; email: string; providers: string[] }
  >({ state: "loading" });

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!supabase) {
        if (alive) setSession({ state: "none" });
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      const u = data.session?.user;
      if (!u) {
        setSession({ state: "none" });
        return;
      }
      // `providers` is what the account was actually created with. Reading it
      // rather than listing Apple and Google as permanently "Not connected".
      const raw = (u.app_metadata as { providers?: unknown } | undefined)?.providers;
      const providers = Array.isArray(raw)
        ? raw.filter((x): x is string => typeof x === "string")
        : [];
      setSession({ state: "in", email: u.email ?? "", providers });
    })();
    return () => {
      alive = false;
    };
  }, []);

  const signedIn = session.state === "in";

  return (
    <SettingsPage title="Account" subtitle="How you sign in, and who ICEFALL thinks you are.">
      <Group label="Sign-in">
        <InfoRow
          title="Email"
          detail={
            session.state === "loading"
              ? "Checking…"
              : signedIn
                ? "The address this account signs in with."
                : "No account is attached to this device."
          }
          value={session.state === "loading" ? "—" : signedIn ? session.email || "Set" : "Not set"}
          tone={signedIn ? undefined : "mist"}
        />
        <InfoRow
          title="Phone"
          detail="Optional, and only ever used for sign-in."
          value="Not set"
          tone="mist"
        />
        <InfoRow
          title="Password"
          detail={signedIn ? "Change it from Security." : "Set when you create an account."}
          value={signedIn ? "Set" : "Not set"}
          tone={signedIn ? undefined : "mist"}
        />
      </Group>

      {/* Only the providers this account actually carries. An unconnected
          provider is not listed as a row that says "Not connected" forever —
          that reads as a broken integration rather than a choice not taken. */}
      {signedIn && session.providers.filter((p) => p !== "email").length > 0 && (
        <Group label="Connected accounts">
          {session.providers
            .filter((p) => p !== "email")
            .map((p) => (
              <InfoRow
                key={p}
                title={p[0]!.toUpperCase() + p.slice(1)}
                value="Connected"
                tone="azure"
              />
            ))}
        </Group>
      )}

      <Group label="Member">
        <ActionRow
          title="ICEFALL member ID"
          detail={id}
          value={copied ? "Copied" : "Copy"}
          tone="azure"
          onClick={() => {
            void navigator.clipboard?.writeText(id).catch(() => {});
            setCopied(true);
          }}
        />
      </Group>

      <Rise className="pt-4">
        {/* This said "there is nothing to sign in to" in the same sentence as
            "your account is on ICEFALL's server" — it contradicted itself, and
            the second half stopped being true when auth shipped. */}
        <Disclaimer>
          {signedIn
            ? "Your account is on ICEFALL's server. Your training is stored on this device only, so it does not move with the account — signing in on a new phone gives you your handle back, not your recorded activities."
            : "There is no account on this device. Your training is stored here and nowhere else, so nothing is recoverable if the device is lost."}
        </Disclaimer>
      </Rise>
    </SettingsPage>
  );
}

/**
 * PH-19b — Security does the one thing it can actually do.
 *
 * Every row was `Unavailable` under a blanket `NOT_BUILT`, written when there
 * were no accounts. **Changing a password is real now**: `sendPasswordReset`
 * goes through Supabase and emails a link. So it is a control rather than a
 * label — and the rows that are still genuinely unavailable keep saying so,
 * because passkeys and 2FA are not built and pretending otherwise here would be
 * the more expensive lie on a security page.
 *
 * "Active sessions: 1" is DELETED rather than corrected. It counted nothing —
 * it was the literal number 1 — and on a security screen a fabricated session
 * count is the worst possible figure to invent: someone checking whether they
 * have been broken into would be reassured by a constant.
 */
function Security() {
  const [sent, setSent] = useState<null | "sending" | "sent" | "signed-out" | "failed">(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      if (alive) setEmail(data.session?.user.email ?? null);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function resetPassword() {
    if (!email) {
      setSent("signed-out");
      return;
    }
    setSent("sending");
    const outcome = await sendPasswordReset(email);
    setSent(outcome.ok ? "sent" : "failed");
  }

  return (
    <SettingsPage title="Security" subtitle="Passwords, second factors and signed-in devices.">
      <Group label="Sign-in">
        <ActionRow
          title="Change password"
          detail={
            email
              ? `We email a reset link to ${email}.`
              : "Sign in first — a reset link needs an address to go to."
          }
          value={
            sent === "sending"
              ? "Sending…"
              : sent === "sent"
                ? "Link sent"
                : sent === "failed"
                  ? "Failed"
                  : undefined
          }
          tone={sent === "sent" ? "azure" : undefined}
          onClick={() => void resetPassword()}
          disabled={sent === "sending"}
        />
        <InfoRow
          title="Passkeys"
          detail="Sign in with Face ID or a security key."
          value="Not built"
          tone="mist"
        />
        <InfoRow
          title="Two-factor authentication"
          detail="A second step when signing in somewhere new."
          value="Not built"
          tone="mist"
        />
      </Group>
      <Rise className="pt-4">
        <Disclaimer>
          {sent === "sent"
            ? "A reset link is on its way. It arrives from ICEFALL's sign-in provider and expires — if it does not appear, ask again rather than waiting."
            : sent === "signed-out"
              ? "There is no account on this device, so there is no password to change."
              : "Passkeys and two-factor sign-in are not built. ICEFALL does not list how many devices are signed in, because it does not track them — a count it cannot measure is worth less than nothing on a security page."}
        </Disclaimer>
      </Rise>
    </SettingsPage>
  );
}

/* ========================================================================== */
/* Privacy & safety                                                           */
/* ========================================================================== */

function Privacy() {
  const { settings, patch } = useSettings();
  const { networkOptIn, setNetworkOptIn } = useApp();

  return (
    <SettingsPage title="Privacy" subtitle="Who can see you, and who can reach you.">
      <Group label="Visibility">
        <ChoiceRow
          title="Profile"
          detail="Who can open your profile."
          options={VISIBILITY_OPTIONS}
          value={settings.profileVisibility}
          onChange={(v: Visibility) => patch({ profileVisibility: v })}
        />
        <ChoiceRow
          title="Activity"
          detail="Your training sessions and routes."
          options={VISIBILITY_OPTIONS}
          value={settings.activityVisibility}
          onChange={(v: Visibility) => patch({ activityVisibility: v })}
        />
        <ChoiceRow
          title="Summits"
          detail="What you have climbed."
          options={VISIBILITY_OPTIONS}
          value={settings.summitVisibility}
          onChange={(v: Visibility) => patch({ summitVisibility: v })}
        />
        {/* PH-19c — posts. Its own option set, because a post always has an
            author and so "private" is not one of its answers. */}
        <ChoiceRow
          title="Posts"
          detail="Who a post you write is for."
          options={POST_VISIBILITY_OPTIONS}
          value={settings.postVisibility}
          onChange={(v: PostVisibility) => patch({ postVisibility: v })}
        />
      </Group>

      <Group label="Being found">
        <ToggleRow
          title="Let people find me"
          detail="Appear in People for athletes preparing for the same mountain."
          checked={networkOptIn}
          onChange={setNetworkOptIn}
        />
        <ChoiceRow
          title="Who can send me a connection"
          options={
            [
              { value: "everyone", label: "Anyone" },
              {
                value: "same-mountain",
                label: "Same mountain",
                detail: "Only athletes with an objective you share.",
              },
              { value: "nobody", label: "Nobody" },
            ] as const
          }
          value={settings.whoCanConnect}
          onChange={(v) => patch({ whoCanConnect: v })}
        />
        <ChoiceRow
          title="Who can add me to a group"
          options={
            [
              {
                value: "connections",
                label: "Connections",
                detail: "Only people whose connection you accepted.",
              },
              { value: "nobody", label: "Nobody" },
            ] as const
          }
          value={settings.whoCanAddToGroups}
          onChange={(v) => patch({ whoCanAddToGroups: v })}
        />
        <ToggleRow
          title="Show when I'm online"
          detail="Off by default. Nobody needs to know when you are awake."
          checked={settings.onlineStatus}
          onChange={(v) => patch({ onlineStatus: v })}
        />
      </Group>

      {/* PH-19c — THE SETTING IS STORED; IT IS NOT YET ENFORCED, AND THAT IS
          SAID RATHER THAN LEFT TO BE ASSUMED. ICEFALL has no server behind
          posts, so nothing anybody writes reaches another account at all — a
          control promising "only my friends can see this" would be describing a
          restriction on an audience that does not exist. Same shape as the
          notification preferences, which are stored against the day there is a
          server to honour them. */}
      <Rise className="pt-4">
        <Disclaimer>
          Visibility choices are saved on this device and will be applied when posts can reach other
          people. Nothing you write is sent anywhere today, so no post has an audience to restrict
          yet — these settle what happens when one exists, rather than describing what happens now.
        </Disclaimer>
      </Rise>

      <Rise className="pt-3">
        <Disclaimer>{LOCATION_NOTICE}</Disclaimer>
      </Rise>
    </SettingsPage>
  );
}

function Location() {
  const { locationOptIn, setLocationOptIn } = useApp();

  return (
    <SettingsPage title="Location" subtitle="Approximate, optional, and off until you allow it.">
      <Rise>
        <p className="text-[12.5px] leading-relaxed text-mist">
          ICEFALL uses an approximate position to help you discover nearby mountains, routes and
          compatible athletes. The app works completely without it.
        </p>
      </Rise>

      <Group label="Permission">
        <ToggleRow
          title="Location discovery"
          detail="Rounds your position to roughly a 5 km grid before it is stored."
          checked={locationOptIn}
          onChange={setLocationOptIn}
        />
      </Group>

      <Group label="What other people see">
        <InfoRow
          title="A distance band"
          detail="Never a coordinate, an address or a precise figure."
          value={approxDistanceLabel(38)}
        />
        <InfoRow
          title="Never"
          detail="Your exact position, your home, or where you are right now."
          value="—"
          tone="mist"
        />
      </Group>

      <Rise className="pt-4">
        <Disclaimer>{LOCATION_NOTICE}</Disclaimer>
      </Rise>
    </SettingsPage>
  );
}

function Safety() {
  const { blockedIds, unblockAthlete } = useApp();
  const { settings, patch } = useSettings();

  return (
    <SettingsPage title="Safety" subtitle="Blocking, reporting, and how ICEFALL keeps this safe.">
      <Group label="Blocked people">
        {blockedIds.length === 0 ? (
          <InfoRow title="Nobody is blocked" detail="Blocked people cannot see you or reach you." />
        ) : (
          blockedIds.map((id) => (
            <ActionRow
              key={id}
              title={id}
              detail="Blocked"
              value="Unblock"
              tone="azure"
              onClick={() => unblockAthlete(id)}
            />
          ))
        )}
      </Group>

      <Group label="Age & interaction">
        <ChoiceRow
          title="Your age band"
          detail="Never shown to anyone. Used only to keep adult and under-18 accounts apart."
          options={
            [
              { value: "unset", label: "Not set" },
              { value: "under-18", label: "Under 18" },
              { value: "18-24", label: "18–24" },
              { value: "25-34", label: "25–34" },
              { value: "35-44", label: "35–44" },
              { value: "45-54", label: "45–54" },
              { value: "55-plus", label: "55+" },
            ] as const
          }
          value={settings.ageBand}
          onChange={(v) => patch({ ageBand: v })}
        />
        {/*
          REMOVED: an InfoRow reading "Under-18 protections are on / Active".

          None of the three protections it named existed. `ageBand` is written
          here and read nowhere else in the app — no messaging, discovery or
          location path consults it — so the row asserted a live safety feature
          that was not built, in the one place a parent or a young climber would
          go to check.

          It also cost more than it appeared to. The cheapest defensible
          position under the Online Safety Act is a finding that ICEFALL is not
          likely to be accessed by children; a screen stating that child
          protections are ACTIVE is evidence to the contrary.

          The age question itself is kept — it is honest to ask, and it is what
          a future gate would read. Nothing may claim that gate exists until it
          does.
        */}
      </Group>

      <Group label="Report">
        <LinkRow
          to="/settings/support"
          icon={Flag}
          title="Report a safety issue"
          detail="Something that puts someone at risk."
        />
        <LinkRow
          to="/settings/legal"
          icon={ShieldCheck}
          title="Community guidelines"
          detail="What is expected of everyone here."
        />
      </Group>

      <Rise className="pt-4">
        <Disclaimer>{SAFETY_REMINDER}</Disclaimer>
      </Rise>
    </SettingsPage>
  );
}

/* ========================================================================== */
/* Professional                                                               */
/* ========================================================================== */

function Professional() {
  const { settings } = useSettings();
  return (
    <SettingsPage
      title="Professional Centre"
      subtitle="Guiding, expeditions and mountain standing."
    >
      <Group>
        <LinkRow
          to="/settings/professional/guide"
          icon={Pickaxe}
          title="Become an ICEFALL Guide"
          detail="Offer professional mountain guiding through ICEFALL."
          value={settings.guide.status === "none" ? undefined : "Applied"}
          tone="azure"
        />
        <LinkRow
          to="/settings/professional/company"
          icon={Building2}
          title="Become an Expedition Partner"
          detail="List your expeditions and reach climbers planning their next mountain."
          value={settings.company.status === "none" ? undefined : "Applied"}
          tone="azure"
        />
        <LinkRow
          to="/settings/professional/sherpa"
          icon={Sparkles}
          title="Apply for the Sherpa badge"
          detail="Recognition for significant mountain experience and contribution."
          value={settings.sherpa.status === "none" ? undefined : "Applied"}
          tone="azure"
        />
        <LinkRow
          to="/settings/verification"
          icon={ShieldCheck}
          title="Verification"
          detail="Manage identity and professional verification."
        />
      </Group>
      <Rise className="pt-4">
        <Disclaimer>
          None of these can be granted from inside the app. Reviewing a qualification, an insurance
          policy or a company registration needs people and a server ICEFALL does not have — so an
          application is recorded on this device and no badge is issued.
        </Disclaimer>
      </Rise>
    </SettingsPage>
  );
}

/* ========================================================================== */
/* Mountains                                                                  */
/* ========================================================================== */

function MyMountains() {
  const { goals } = useApp();
  const active = goals.filter((g) => g.status === "active");
  const done = goals.filter((g) => g.status === "completed");

  return (
    <SettingsPage title="My mountains" subtitle="Your objectives and their dates.">
      <Group label="Active">
        {active.length === 0 ? (
          <InfoRow
            title="No objective set"
            detail="Pick a mountain and the whole app orients around it."
          />
        ) : (
          active.map((g, i) => (
            <LinkRow
              key={g.id}
              to="/goals"
              icon={MountainIcon}
              title={g.name}
              detail={`${fmtDate(g.targetDate)} · ${Math.round(g.preparation)}% prepared`}
              value={i === 0 ? "Primary" : undefined}
              tone="azure"
            />
          ))
        )}
      </Group>

      {done.length > 0 && (
        <Group label="Completed">
          {done.map((g) => (
            <InfoRow key={g.id} icon={Award} title={g.name} detail={fmtDate(g.targetDate)} />
          ))}
        </Group>
      )}

      <Group label="Manage">
        <LinkRow
          to="/goals"
          title="Add or change an objective"
          detail="Objectives are edited on the Goals screen."
        />
      </Group>

      <Rise className="pt-4">
        <Disclaimer>
          The first active objective is the one the Coach, Home and preparation figures follow.
          Completed objectives are kept — they are your record.
        </Disclaimer>
      </Rise>
    </SettingsPage>
  );
}

function MountainCV() {
  const { settings, patch } = useSettings();
  return (
    <SettingsPage title="Mountain CV" subtitle="What you have actually climbed.">
      <Rise>
        <Card>
          <p className="text-[12.5px] leading-relaxed text-mist">
            Your CV is assembled from the Mountain Passport — summits, highest altitude, technical
            ground and the skills you reported. Nothing in it can be typed in by hand, which is what
            makes it worth showing to a guide or a partner.
          </p>
          <Link to="/profile" className="mt-3 inline-block text-[12.5px] text-azure">
            Open the Passport →
          </Link>
        </Card>
      </Rise>
      <Group label="Visibility">
        <ChoiceRow
          title="Who can see it"
          options={VISIBILITY_OPTIONS}
          value={settings.passportVisibility}
          onChange={(v: Visibility) => patch({ passportVisibility: v })}
        />
      </Group>
    </SettingsPage>
  );
}

/* ========================================================================== */
/* Data                                                                       */
/* ========================================================================== */

function DataActivity() {
  const [done, setDone] = useState(false);

  return (
    <SettingsPage title="Data & activity" subtitle="Everything ICEFALL holds about you.">
      <Group label="Your data">
        <ActionRow
          icon={Download}
          title={done ? "Downloaded" : "Download my data"}
          detail="Every activity, goal, setting and record, as one JSON file."
          onClick={() => {
            const blob = new Blob([JSON.stringify(dumpLocalData(), null, 2)], {
              type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "icefall-data.json";
            a.click();
            URL.revokeObjectURL(url);
            setDone(true);
          }}
        />
        <LinkRow
          to="/activity"
          title="Activity history"
          detail="Every session you have recorded. Only you can see it."
        />
      </Group>

      <Group label="Permissions">
        <LinkRow
          to="/settings/location"
          icon={MapPin}
          title="Location"
          detail="Approximate position, off by default."
        />
        <LinkRow
          to="/settings/devices"
          icon={Watch}
          title="Devices & health apps"
          detail="Nothing is connected."
        />
      </Group>

      <Rise className="pt-4">
        <Disclaimer>
          Everything ICEFALL records stays on this device. Nothing is uploaded, so there is nothing
          held on a server to request — and no backup if the device is lost.
        </Disclaimer>
      </Rise>
    </SettingsPage>
  );
}

/** Every ICEFALL key in localStorage, so an export is genuinely everything. */
function dumpLocalData(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith("icefall.")) continue;
      const raw = localStorage.getItem(key);
      try {
        out[key] = raw ? JSON.parse(raw) : null;
      } catch {
        out[key] = raw;
      }
    }
  } catch {
    /* private mode */
  }
  return out;
}

function Devices() {
  const integrations = [
    // Strava was removed at the owner's instruction on 2026-09-03. Everything left
    // is a WATCH OR A HEALTH STORE — a place training data is measured or kept.
    // Strava was the odd one out: another training app and a social network, not a
    // source, so listing it invited "ICEFALL will import my Strava history" when the
    // page only ever meant "your watch could feed this". Do not re-add it here if
    // an import is ever built; that belongs wherever accounts are connected.
    //
    // Garmin, COROS, Suunto and Polar were removed 2026-09-07, the day COROS
    // connected — this screen would otherwise become a lie the moment it ships:
    // it listed all three as "Not connected" under "None of these integrations
    // exist yet" while a COROS watch account could, from that day, actually be
    // linked. The four watch services are account links for the same reason
    // Strava is: they are read from the watch service's cloud, not paired to
    // this device, so they belong under Connected accounts, not here.
    "Apple Watch",
    "Apple Health",
    "Google Health",
  ];
  return (
    <SettingsPage title="Devices & apps" subtitle="Where your training data could come from.">
      <LinkRow
        to="/settings/connections"
        icon={Watch}
        title="Watch accounts"
        detail="Garmin, COROS, Suunto and Polar — connected as accounts, not paired as devices."
      />
      <Rise className="pt-4">
        <Group>
          {integrations.map((name) => (
            <InfoRow key={name} icon={Watch} title={name} value="Not connected" tone="mist" />
          ))}
        </Group>
      </Rise>
      <Rise className="pt-4">
        <Disclaimer>
          None of the integrations above exist yet, so none of them are offered as a button that
          would do nothing. A Garmin, COROS, Suunto or Polar account is connected under Connected
          accounts instead — that reads activities from the watch service's cloud rather than from
          the watch itself. ICEFALL records activity with the phone's own GPS in the meantime.
        </Disclaimer>
      </Rise>
    </SettingsPage>
  );
}

function OfflineData() {
  const [cleared, setCleared] = useState(false);
  return (
    <SettingsPage title="Offline data" subtitle="What works without a signal.">
      <Group label="On this device">
        <InfoRow
          title="The app itself"
          detail="Every screen loads with no connection."
          value="Installed"
          tone="azure"
        />
        <InfoRow
          title="Peak catalogue"
          detail="4,193 Alpine summits, bundled with the app."
          value="Bundled"
          tone="azure"
        />
        <InfoRow
          title="Map tiles & photos"
          detail="Cached as you use them."
          value="Cached"
          tone="azure"
        />
        <InfoRow
          title="Recording"
          detail="GPS, distance and ascent all work offline."
          value="Always on"
          tone="azure"
        />
      </Group>

      <Group label="Manage">
        <ActionRow
          icon={RotateCcw}
          title={cleared ? "Cache cleared" : "Clear cached maps and photos"}
          detail="Frees space. Your activities and settings are untouched."
          onClick={() => {
            void caches
              ?.keys()
              .then((keys) =>
                Promise.all(
                  keys
                    .filter((k) => /icefall-(images|map-tiles|terrain|conditions|peak)/.test(k))
                    .map((k) => caches.delete(k)),
                ),
              )
              .catch(() => {});
            setCleared(true);
          }}
        />
      </Group>

      <Rise className="pt-4">
        <Disclaimer>
          Downloadable offline packs for a specific mountain need a routing and tile service that is
          not connected. What is listed above is what genuinely works today.
        </Disclaimer>
      </Rise>
    </SettingsPage>
  );
}

/* ========================================================================== */
/* Membership                                                                 */
/* ========================================================================== */

function Membership() {
  const { currentTier } = useApp();
  const plan = planFor(currentTier);

  return (
    <SettingsPage title="Membership" subtitle="Your plan and what it includes.">
      <Rise>
        <div className="rounded-card border border-azure/35 bg-azure/[0.05] p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-azure">Current plan</p>
          <p className="mt-1.5 text-[22px] font-light text-snow">{plan.name}</p>
          {plan.monthlyEur ? (
            <p className="tnum mt-1 text-[13px] text-mist">€{plan.monthlyEur} / month</p>
          ) : (
            <p className="mt-1 text-[13px] text-mist">No charge</p>
          )}
        </div>
      </Rise>

      <Group label="Manage">
        <LinkRow
          to="/pricing"
          icon={Award}
          title="Change plan"
          detail="Compare what each plan includes."
        />
        <InfoRow
          title="Billing history"
          detail="Available once payments are connected."
          value="Unavailable"
          tone="mist"
        />
        <InfoRow
          title="Restore purchases"
          detail="For an App Store or Play subscription."
          value="Unavailable"
          tone="mist"
        />
      </Group>

      <Rise className="pt-4">
        <Disclaimer>
          Payments are not connected, so nothing has been charged and no card is stored. Plans are
          selectable so the rest of the app can be tried.
        </Disclaimer>
      </Rise>
    </SettingsPage>
  );
}

function Referrals() {
  const { user } = useApp();
  const [copied, setCopied] = useState(false);
  const code = memberId(user.name ?? "").replace("ICE-", "");
  const link = `https://icefall.app/join/${code}`;

  return (
    <SettingsPage title="Expedition crew" subtitle="Bring people in, earn Pro months.">
      <Group label="Your link">
        <ActionRow
          title={copied ? "Link copied" : "Copy invite link"}
          detail={link}
          onClick={() => {
            void navigator.clipboard?.writeText(link).catch(() => {});
            setCopied(true);
          }}
        />
      </Group>

      <Group label="Progress">
        <InfoRow
          title="Qualified referrals"
          detail="People who joined and became paying Pro members."
          value="0"
        />
        <InfoRow title="Pending" detail="Signed up, not yet qualified." value="0" tone="mist" />
        <InfoRow title="Pro months earned" value="0" />
      </Group>

      <Rise className="pt-4">
        <Disclaimer>
          A referral only counts once the person becomes a paying Pro member. Free sign-ups, free
          trials and self-referrals do not count. Referrals need accounts and payments, neither of
          which is connected — so nothing here can move yet.
        </Disclaimer>
      </Rise>
    </SettingsPage>
  );
}

/* ========================================================================== */
/* Notifications                                                              */
/* ========================================================================== */

function Notifications() {
  const { notifications, setNotification } = useApp();
  const { settings, patch } = useSettings();

  const all =
    notifications.training &&
    notifications.recovery &&
    notifications.goal &&
    notifications.conditions &&
    settings.notifyCommunity &&
    settings.notifyConnections &&
    settings.notifyGroups &&
    settings.notifyBookings;

  const setAll = (on: boolean) => {
    (["training", "recovery", "goal", "conditions"] as const).forEach((k) =>
      setNotification(k, on),
    );
    patch({
      notifyCommunity: on,
      notifyConnections: on,
      notifyGroups: on,
      notifyBookings: on,
    });
  };

  return (
    <SettingsPage title="Notifications" subtitle="What ICEFALL is allowed to interrupt you for.">
      <Group>
        <ToggleRow
          icon={Bell}
          title="All notifications"
          detail="Turns everything below on or off at once."
          checked={all}
          onChange={setAll}
        />
      </Group>

      <Group label="Training">
        <ToggleRow
          title="Training reminders"
          detail="The session you planned for today."
          checked={notifications.training}
          onChange={(v) => setNotification("training", v)}
        />
        <ToggleRow
          title="Coach updates"
          detail="When the plan changes or you should ease off."
          checked={notifications.recovery}
          onChange={(v) => setNotification("recovery", v)}
        />
        <ToggleRow
          title="Objective"
          detail="Countdown and preparation milestones."
          checked={notifications.goal}
          onChange={(v) => setNotification("goal", v)}
        />
        <ToggleRow
          title="Mountain conditions"
          detail="Weather that changes your plans."
          checked={notifications.conditions}
          onChange={(v) => setNotification("conditions", v)}
        />
      </Group>

      <Group label="People & groups">
        <ToggleRow
          title="Connection requests"
          detail="Someone wants to connect."
          checked={settings.notifyConnections}
          onChange={(v) => patch({ notifyConnections: v })}
        />
        <ToggleRow
          title="Group activity"
          detail="Updates in a group you are in."
          checked={settings.notifyGroups}
          onChange={(v) => patch({ notifyGroups: v })}
        />
        <ToggleRow
          title="Community"
          detail="Replies to your posts."
          checked={settings.notifyCommunity}
          onChange={(v) => patch({ notifyCommunity: v })}
        />
        <ToggleRow
          title="Bookings & guides"
          detail="Anything about an expedition you booked."
          checked={settings.notifyBookings}
          onChange={(v) => patch({ notifyBookings: v })}
        />
      </Group>

      <Group label="From ICEFALL">
        <ToggleRow
          title="Product announcements & offers"
          detail="Off unless you turn it on, and it will not be turned on for you."
          checked={settings.notifyMarketing}
          onChange={(v) => patch({ notifyMarketing: v })}
        />
      </Group>

      <Rise className="pt-4">
        <Disclaimer>
          ICEFALL does not send "we miss you" notifications. Push delivery needs a server, so these
          preferences are stored and will be honoured the day one exists.
        </Disclaimer>
      </Rise>
    </SettingsPage>
  );
}

/* ========================================================================== */
/* Support, legal, about                                                      */
/* ========================================================================== */

/**
 * Help & support.
 *
 * THREE `mailto:` LINKS CAME OUT OF HERE, AND THE DISCLAIMER THAT EXCUSED THEM.
 *
 * The rows opened the device's mail app at `support@icefall.app` (twice) and
 * `safety@icefall.app` (once). Neither address has a mailbox behind it. The
 * screen said so — *"There is no support desk behind the addresses yet"* —
 * which made it honest and useless in the same breath: a climber with a real
 * problem still composed a message, still pressed send, and it still went
 * nowhere. Worse than a missing button, because the failure was invisible on
 * both sides. Nobody could even count the people who tried.
 *
 * Every row now opens the real form, which writes a row and hands back a
 * reference. The type is pre-selected from the row they tapped, because the
 * distinction between "a person is at risk" and "a button is broken" is worth
 * keeping even though both reach the same desk — ICEFALL has one desk, and a
 * second destination would be a second empty mailbox.
 *
 * REPORTING A POST OR A PERSON IS NOT HERE. That is moderation
 * (`src/social/comments.ts`), it is done from the post itself, and it needs
 * different powers and a different speed than a support queue.
 */
function Support() {
  return (
    <SettingsPage title="Help & support" subtitle="Get help or report something.">
      <Group label="Safety first">
        <LinkRow
          icon={Flag}
          title="Report a safety issue"
          detail="Someone or something putting a person at risk."
          to="/settings/contact?type=safety"
        />
      </Group>
      <Group label="Help">
        <LinkRow
          icon={LifeBuoy}
          title="Contact support"
          detail="A question about your account or the app."
          to="/settings/contact?type=account"
        />
        <LinkRow
          icon={Flag}
          title="Report a bug"
          detail="Something is broken or wrong."
          to="/settings/contact?type=technical"
        />
      </Group>
      <Rise className="pt-4">
        <Disclaimer>{SUPPORT_NO_RESPONSE_TIME}</Disclaimer>
      </Rise>
      <Rise className="pt-3">
        <Disclaimer>{SUPPORT_ABUSE_IS_SEPARATE}</Disclaimer>
      </Rise>
    </SettingsPage>
  );
}

function Legal() {
  const docs = [
    { title: "Terms of service", detail: "The agreement between you and ICEFALL." },
    { title: "Privacy policy", detail: "What is collected, and what is not." },
    { title: "Community guidelines", detail: "What is expected of everyone here." },
    { title: "Booking policy", detail: "How bookings with guides and operators work." },
    { title: "Refund policy", detail: "When money comes back." },
    { title: "Referral terms", detail: "What counts as a qualified referral." },
    { title: "Subscription terms", detail: "Billing, renewal and cancellation." },
    { title: "Safety information", detail: "What ICEFALL does and does not check." },
    { title: "AI information", detail: "How the Coach works and what it must not be used for." },
  ];
  return (
    <SettingsPage title="Legal" subtitle="Terms and policies.">
      <Group>
        {docs.map((d) => (
          <InfoRow
            key={d.title}
            title={d.title}
            detail={d.detail}
            value="Not written"
            tone="mist"
          />
        ))}
      </Group>
      <Rise className="pt-4">
        <Disclaimer>
          These documents have not been written. Publishing a policy ICEFALL has not actually
          committed to would be worse than the gap — they are listed so nothing is forgotten before
          launch.
        </Disclaimer>
      </Rise>
    </SettingsPage>
  );
}

function About() {
  return (
    <SettingsPage title="About ICEFALL" subtitle="Version, credits and sources.">
      <Group label="This build">
        <InfoRow title="Version" value="0.1.0" />
        <InfoRow
          title="Platform"
          detail="Runs in the browser and installs to your home screen."
          value="Web / PWA"
        />
      </Group>
      <Group label="Where the data comes from">
        <InfoRow
          icon={MountainIcon}
          title="Peaks, trails and places"
          detail="OpenStreetMap contributors, ODbL."
        />
        <InfoRow
          icon={Award}
          title="Photographs & facts"
          detail="Wikimedia Commons and Wikidata, each credited where shown."
        />
        <InfoRow icon={MapPin} title="Weather" detail="Open-Meteo." />
      </Group>
      <Group label="Links">
        <ActionRow
          icon={ExternalLink}
          title="OpenStreetMap"
          detail="openstreetmap.org/copyright"
          onClick={() =>
            window.open("https://www.openstreetmap.org/copyright", "_blank", "noopener")
          }
        />
      </Group>
    </SettingsPage>
  );
}

/* ========================================================================== */
/* The end                                                                    */
/* ========================================================================== */

function ManageAccount() {
  const { resetAll, signOut: forgetLocalAccount } = useApp();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState<"this" | "all" | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const connected = isBackendConfigured();

  /* Two sign-outs, both real. The local one keeps every recorded activity on
     the phone on purpose (see `signOut` in AppState); the server one ends the
     session so the gate closes. "All devices" asks the server to revoke every
     refresh token, which this device is one of. */
  async function leave(scope: "this" | "all") {
    if (leaving) return;
    setLeaving(scope);
    setLeaveError(null);
    if (scope === "all") {
      const r = await signOutEverywhere();
      if (!r.ok) {
        setLeaveError(r.message);
        setLeaving(null);
        return;
      }
    } else {
      await signOutServer();
    }
    forgetLocalAccount();
    navigate("/", { replace: true });
  }

  return (
    <SettingsPage title="Account management" subtitle="Signing out and deleting.">
      <Group label="Session">
        {connected ? (
          <>
            <ActionRow
              icon={LogOut}
              title="Sign out"
              detail="Your recorded activities stay on this phone."
              disabled={leaving !== null}
              onClick={() => void leave("this")}
            />
            <ActionRow
              title="Sign out of all devices"
              detail="Ends every session, including this one."
              disabled={leaving !== null}
              onClick={() => void leave("all")}
            />
          </>
        ) : (
          <InfoRow
            icon={LogOut}
            title="Sign out"
            detail="This build isn't connected to an account server, so there is no session to end."
            value="Unavailable"
            tone="mist"
          />
        )}
      </Group>
      {leaveError && (
        <p className="px-1 pt-2 text-[12px] leading-relaxed text-danger">{leaveError}</p>
      )}

      <Rise className="pt-6">
        <div className="rounded-card border border-danger/40 bg-danger/[0.05] p-4">
          <p className="flex items-center gap-2 text-[13px] text-snow">
            <Trash2 size={15} strokeWidth={1.8} className="text-danger" />
            Delete everything
          </p>
          <p className="mt-2 text-[11.5px] leading-relaxed text-mist">
            This erases every activity, objective, setting and achievement on this device and
            restarts onboarding. Nothing is backed up, so there is no way to undo it.
          </p>

          {confirming ? (
            <div className="mt-3.5 space-y-2.5">
              <p className="text-[12px] text-snow">Erase everything? This cannot be undone.</p>
              <div className="flex gap-2.5">
                <Button variant="secondary" className="flex-1" onClick={() => setConfirming(false)}>
                  Keep my data
                </Button>
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={() => {
                    resetAll();
                    navigate("/");
                    window.location.reload();
                  }}
                >
                  Erase
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" className="mt-3.5 w-full" onClick={() => setConfirming(true)}>
              <Trash2 size={14} strokeWidth={1.7} />
              Delete account data
            </Button>
          )}
        </div>
      </Rise>

      <Rise className="pt-4">
        <Disclaimer>
          When ICEFALL has accounts, some records may be kept for a period where the law requires
          it. Nothing leaves this device today, so deleting here deletes everything.
        </Disclaimer>
      </Rise>
    </SettingsPage>
  );
}
