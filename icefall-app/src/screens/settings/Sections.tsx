import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  Award, Bell, Building2, Copy, Download, ExternalLink, Flag, LifeBuoy, LogOut, MapPin,
  Camera, Mountain as MountainIcon, Pickaxe, RotateCcw, ShieldCheck, Shuffle, Sparkles,
  Trash2, Watch,
} from "lucide-react";
import { Button, Card, Disclaimer, Stat, sharePage } from "@/components/ui/primitives";
import { Rise } from "@/components/layout/chrome";
import {
  ActionRow, ChoiceRow, Group, InfoRow, LinkRow, NOT_BUILT, SettingsPage, StatusPill,
  ToggleRow,
} from "@/components/settings/kit";
import {
  POST_VISIBILITY_OPTIONS, VISIBILITY_OPTIONS, memberId, useSettings,
  type PostVisibility, type Visibility,
} from "@/settings/store";
import { LOCATION_NOTICE, SAFETY_REMINDER, approxDistanceLabel } from "@/network/privacy";
import { useApp, usePrimaryGoal } from "@/state/AppState";
import { planFor } from "@/growth/tiers";
import { fmtDate } from "@/lib/format";
import { encodeProfile, profileLink, type SharedProfile } from "@/profile/shareLink";
import { readAvatar } from "@/lib/image";
import { PROFILE_BANNERS, bannerFor, bannerIndex } from "@/profile/banners";
import { BADGES, badgeState } from "@/badges/model";
import { BadgeHex } from "@/components/domain/BadgeHex";
import { supabase } from "@/backend/client";
import { sendPasswordReset } from "@/auth/account";
import SupportRequest from "./SupportRequest";
import { SUPPORT_ABUSE_IS_SEPARATE, SUPPORT_NO_RESPONSE_TIME } from "@/support/tickets";

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
    case "profile": return <EditProfile />;
    case "share": return <ShareProfile />;
    case "verification": return <Verification />;
    case "passport": return <PassportSettings />;
    case "account": return <Account />;
    case "security": return <Security />;
    case "privacy": return <Privacy />;
    case "location": return <Location />;
    case "safety": return <Safety />;
    case "professional": return <Professional />;
    case "mountains": return <MyMountains />;
    case "cv": return <MountainCV />;
    case "data": return <DataActivity />;
    case "devices": return <Devices />;
    case "offline": return <OfflineData />;
    case "membership": return <Membership />;
    case "referrals": return <Referrals />;
    case "notifications": return <Notifications />;
    case "support": return <Support />;
    case "contact": return <SupportRequest />;
    case "legal": return <Legal />;
    case "about": return <About />;
    case "manage": return <ManageAccount />;
    default: return <Navigate to="/settings" replace />;
  }
}

/* ========================================================================== */
/* Profile                                                                    */
/* ========================================================================== */

function Field({
  label, value, onChange, placeholder, multiline, hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; multiline?: boolean; hint?: string;
}) {
  return (
    <div className="border-t border-hairline px-4 py-3.5 first:border-t-0">
      <label className="block text-[11px] uppercase tracking-[0.1em] text-mist-dim">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="mt-2 w-full resize-none bg-transparent text-[14px] text-snow outline-none placeholder:text-mist-dim"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-2 w-full bg-transparent text-[14px] text-snow outline-none placeholder:text-mist-dim"
        />
      )}
      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">{hint}</p>}
    </div>
  );
}

/**
 * The display name.
 *
 * `AppState` has no general name setter — the name is written once by
 * onboarding and by `createAccount`, and nothing else may overwrite it. Rather
 * than add a second path into the same field, this row says where the name
 * comes from and links to the one screen that owns it.
 */
function NameField() {
  const { user } = useApp();
  return (
    <div className="border-t border-hairline px-4 py-3.5 first:border-t-0">
      <label className="block text-[11px] uppercase tracking-[0.1em] text-mist-dim">
        Display name
      </label>
      <p className="mt-2 text-[14px] text-snow">{user.name}</p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">
        Set when you joined. Changing it will move here once accounts exist.
      </p>
    </div>
  );
}

/**
 * Tap the photo to change it.
 *
 * The file never leaves the device — there is nowhere to send it — so it is
 * redrawn through a canvas at 256 px and kept as a small JPEG. See
 * `lib/image.ts`: a raw phone photo would eat the whole localStorage quota and
 * start silently dropping the athlete's training history.
 */
function AvatarPicker() {
  const { user } = useApp();
  const { settings, patch } = useSettings();
  const input = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const photo = settings.avatar;

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      patch({ avatar: await readAvatar(file) });
    } catch (e) {
      setError((e as { message?: string }).message ?? "That image couldn't be used.");
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => input.current?.click()}
          aria-label="Change profile photo"
          className="group relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border border-hairline bg-slate text-[22px] text-mist transition-colors hover:border-azure/50"
        >
          {photo ? (
            <img src={photo} alt="" aria-hidden className="h-full w-full object-cover" />
          ) : (
            (user.name ?? "A").slice(0, 1).toUpperCase()
          )}
          <span className="absolute inset-x-0 bottom-0 grid h-7 place-items-center bg-obsidian/75 text-azure opacity-0 transition-opacity group-hover:opacity-100">
            <Camera size={14} strokeWidth={1.8} />
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] text-snow">Profile photo</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-mist-dim">
            Tap the circle to choose one. It stays on this device and is scaled down before it is
            saved.
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="rounded-pill border border-azure/45 bg-azure/[0.10] px-3 py-1.5 text-[12px] text-azure"
            >
              {photo ? "Change photo" : "Add photo"}
            </button>
            {photo && (
              <button
                type="button"
                onClick={() => patch({ avatar: undefined })}
                className="rounded-pill border border-hairline-strong px-3 py-1.5 text-[12px] text-mist"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <p className="mt-3 text-[11.5px] text-danger">{error}</p>}

      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          // Reset, so picking the same file twice still fires a change.
          e.target.value = "";
        }}
      />
    </div>
  );
}

function EditProfile() {
  const { user } = useApp();
  const { settings, patch } = useSettings();

  return (
    <SettingsPage title="Edit profile" subtitle="What other athletes see about you.">
      <Group label="Photo">
        <AvatarPicker />
      </Group>

      <Group label="About you">
        <NameField />
        <Field
          label="Username"
          value={settings.username}
          onChange={(v) => patch({ username: v.replace(/[^a-zA-Z0-9_.]/g, "").toLowerCase() })}
          placeholder="christofis"
          hint="Letters, numbers, dots and underscores."
        />
        <Field
          label="Bio"
          value={settings.bio}
          onChange={(v) => patch({ bio: v })}
          placeholder="Mountain athlete. Training for big objectives."
          multiline
        />
        <Field
          label="Country / region"
          value={settings.region}
          onChange={(v) => patch({ region: v })}
          placeholder="Athens, Greece"
          hint="A town or region. Never an address — ICEFALL has no field for one."
        />
        <Field
          label="Languages"
          value={settings.languages}
          onChange={(v) => patch({ languages: v })}
          placeholder="English, Greek"
        />
        <Field
          label="Interests"
          value={settings.interests}
          onChange={(v) => patch({ interests: v })}
          placeholder="Alpine climbing, ski touring, long days"
        />
      </Group>

      <Group label="Experience">
        <InfoRow
          title="Mountaineering experience"
          detail="Set during onboarding and used by the Coach. Change it in your training profile."
          value={user.experience ?? "—"}
          tone="mist"
        />
        <LinkRow
          to="/settings/cv"
          title="Verified achievements"
          detail="Summits and skills come from what you recorded. They cannot be edited by hand."
        />
      </Group>

      <Rise className="pt-4">
        <Disclaimer>{NOT_BUILT}</Disclaimer>
      </Rise>
    </SettingsPage>
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

  const handle = settings.username || (user.name ?? "athlete").toLowerCase().replace(/[^a-z0-9]/g, "");

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
            <img src={banner} alt="" aria-hidden className="h-full w-full object-cover opacity-60" />
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
        <LinkRow to={`/p#${encodeProfile(shared)}`} title="Preview the card" detail="See exactly what other people will open." />
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
    { id: "identity" as const, name: "Identity verified", detail: "Confirms you are who you say you are." },
    { id: "history" as const, name: "Expedition history verified", detail: "Confirms the expeditions on your profile happened." },
    { id: "professional" as const, name: "Professional verified", detail: "Confirms a guiding or instructing qualification." },
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
        <LinkRow to="/profile" icon={Award} title="Open Passport" detail="It lives inside your profile." />
        <LinkRow to="/settings/cv" icon={MountainIcon} title="Mountain CV" detail="The same record, written as a CV." />
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
      const providers = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
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
          value={session.state === "loading" ? "—" : signedIn ? (session.email || "Set") : "Not set"}
          tone={signedIn ? undefined : "mist"}
        />
        <InfoRow title="Phone" detail="Optional, and only ever used for sign-in." value="Not set" tone="mist" />
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
              <InfoRow key={p} title={p[0]!.toUpperCase() + p.slice(1)} value="Connected" tone="azure" />
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
            sent === "sending" ? "Sending…" : sent === "sent" ? "Link sent" : sent === "failed" ? "Failed" : undefined
          }
          tone={sent === "sent" ? "azure" : undefined}
          onClick={() => void resetPassword()}
          disabled={sent === "sending"}
        />
        <InfoRow title="Passkeys" detail="Sign in with Face ID or a security key." value="Not built" tone="mist" />
        <InfoRow title="Two-factor authentication" detail="A second step when signing in somewhere new." value="Not built" tone="mist" />
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
          options={[
            { value: "everyone", label: "Anyone" },
            { value: "same-mountain", label: "Same mountain", detail: "Only athletes with an objective you share." },
            { value: "nobody", label: "Nobody" },
          ] as const}
          value={settings.whoCanConnect}
          onChange={(v) => patch({ whoCanConnect: v })}
        />
        <ChoiceRow
          title="Who can add me to a group"
          options={[
            { value: "connections", label: "Connections", detail: "Only people whose connection you accepted." },
            { value: "nobody", label: "Nobody" },
          ] as const}
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
        <InfoRow title="A distance band" detail="Never a coordinate, an address or a precise figure." value={approxDistanceLabel(38)} />
        <InfoRow title="Never" detail="Your exact position, your home, or where you are right now." value="—" tone="mist" />
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
          options={[
            { value: "unset", label: "Not set" },
            { value: "under-18", label: "Under 18" },
            { value: "18-24", label: "18–24" },
            { value: "25-34", label: "25–34" },
            { value: "35-44", label: "35–44" },
            { value: "45-54", label: "45–54" },
            { value: "55-plus", label: "55+" },
          ] as const}
          value={settings.ageBand}
          onChange={(v) => patch({ ageBand: v })}
        />
        {settings.ageBand === "under-18" && (
          <InfoRow
            title="Under-18 protections are on"
            detail="No private messaging with adults, restricted people discovery, and location never shared."
            value="Active"
            tone="azure"
          />
        )}
      </Group>

      <Group label="Report">
        <LinkRow to="/settings/support" icon={Flag} title="Report a safety issue" detail="Something that puts someone at risk." />
        <LinkRow to="/settings/legal" icon={ShieldCheck} title="Community guidelines" detail="What is expected of everyone here." />
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
    <SettingsPage title="Professional Centre" subtitle="Guiding, expeditions and mountain standing.">
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
          <InfoRow title="No objective set" detail="Pick a mountain and the whole app orients around it." />
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
        <LinkRow to="/goals" title="Add or change an objective" detail="Objectives are edited on the Goals screen." />
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
        <LinkRow to="/activity" title="Activity history" detail="Every session you have recorded. Only you can see it." />
      </Group>

      <Group label="Permissions">
        <LinkRow to="/settings/location" icon={MapPin} title="Location" detail="Approximate position, off by default." />
        <LinkRow to="/settings/devices" icon={Watch} title="Devices & health apps" detail="Nothing is connected." />
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
    "Apple Watch", "Apple Health", "Garmin", "COROS", "Suunto", "Strava", "Google Health",
  ];
  return (
    <SettingsPage title="Devices & apps" subtitle="Where your training data could come from.">
      <Group>
        {integrations.map((name) => (
          <InfoRow key={name} icon={Watch} title={name} value="Not connected" tone="mist" />
        ))}
      </Group>
      <Rise className="pt-4">
        <Disclaimer>
          None of these integrations exist yet, so none of them are offered as a button that would
          do nothing. ICEFALL records activity with the phone's own GPS in the meantime.
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
        <InfoRow title="The app itself" detail="Every screen loads with no connection." value="Installed" tone="azure" />
        <InfoRow title="Peak catalogue" detail="4,193 Alpine summits, bundled with the app." value="Bundled" tone="azure" />
        <InfoRow title="Map tiles & photos" detail="Cached as you use them." value="Cached" tone="azure" />
        <InfoRow title="Recording" detail="GPS, distance and ascent all work offline." value="Always on" tone="azure" />
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
                  keys.filter((k) => /icefall-(images|map-tiles|terrain|conditions|peak)/.test(k)).map((k) => caches.delete(k)),
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
        <LinkRow to="/pricing" icon={Award} title="Change plan" detail="Compare what each plan includes." />
        <InfoRow title="Billing history" detail="Available once payments are connected." value="Unavailable" tone="mist" />
        <InfoRow title="Restore purchases" detail="For an App Store or Play subscription." value="Unavailable" tone="mist" />
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
        <InfoRow title="Qualified referrals" detail="People who joined and became paying Pro members." value="0" />
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
    notifications.training && notifications.recovery && notifications.goal && notifications.conditions &&
    settings.notifyCommunity && settings.notifyConnections && settings.notifyGroups && settings.notifyBookings;

  const setAll = (on: boolean) => {
    (["training", "recovery", "goal", "conditions"] as const).forEach((k) => setNotification(k, on));
    patch({
      notifyCommunity: on, notifyConnections: on, notifyGroups: on, notifyBookings: on,
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
        <ToggleRow title="Training reminders" detail="The session you planned for today." checked={notifications.training} onChange={(v) => setNotification("training", v)} />
        <ToggleRow title="Coach updates" detail="When the plan changes or you should ease off." checked={notifications.recovery} onChange={(v) => setNotification("recovery", v)} />
        <ToggleRow title="Objective" detail="Countdown and preparation milestones." checked={notifications.goal} onChange={(v) => setNotification("goal", v)} />
        <ToggleRow title="Mountain conditions" detail="Weather that changes your plans." checked={notifications.conditions} onChange={(v) => setNotification("conditions", v)} />
      </Group>

      <Group label="People & groups">
        <ToggleRow title="Connection requests" detail="Someone wants to connect." checked={settings.notifyConnections} onChange={(v) => patch({ notifyConnections: v })} />
        <ToggleRow title="Group activity" detail="Updates in a group you are in." checked={settings.notifyGroups} onChange={(v) => patch({ notifyGroups: v })} />
        <ToggleRow title="Community" detail="Replies to your posts." checked={settings.notifyCommunity} onChange={(v) => patch({ notifyCommunity: v })} />
        <ToggleRow title="Bookings & guides" detail="Anything about an expedition you booked." checked={settings.notifyBookings} onChange={(v) => patch({ notifyBookings: v })} />
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
          <InfoRow key={d.title} title={d.title} detail={d.detail} value="Not written" tone="mist" />
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
        <InfoRow title="Platform" detail="Runs in the browser and installs to your home screen." value="Web / PWA" />
      </Group>
      <Group label="Where the data comes from">
        <InfoRow icon={MountainIcon} title="Peaks, trails and places" detail="OpenStreetMap contributors, ODbL." />
        <InfoRow icon={Award} title="Photographs & facts" detail="Wikimedia Commons and Wikidata, each credited where shown." />
        <InfoRow icon={MapPin} title="Weather" detail="Open-Meteo." />
      </Group>
      <Group label="Links">
        <ActionRow icon={ExternalLink} title="OpenStreetMap" detail="openstreetmap.org/copyright" onClick={() => window.open("https://www.openstreetmap.org/copyright", "_blank", "noopener")} />
      </Group>
    </SettingsPage>
  );
}

/* ========================================================================== */
/* The end                                                                    */
/* ========================================================================== */

function ManageAccount() {
  const { resetAll } = useApp();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  return (
    <SettingsPage title="Account management" subtitle="Signing out and deleting.">
      <Group label="Session">
        <InfoRow icon={LogOut} title="Sign out" detail="There is no account to sign out of yet." value="Unavailable" tone="mist" />
        <InfoRow title="Sign out of all devices" detail="Nothing is signed in anywhere else." value="Unavailable" tone="mist" />
      </Group>

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
