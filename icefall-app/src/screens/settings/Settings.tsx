import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Award,
  Bell,
  BadgeCheck,
  Compass,
  CloudOff,
  ShieldCheck,
  Database,
  FileText,
  HeartPulse,
  Info,
  LifeBuoy,
  Lock,
  LogOut,
  MapPin,
  Mountain as MountainIcon,
  Share2,
  Sparkles,
  User,
  Link2,
  UserCog,
  Watch,
} from "lucide-react";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { ActionRow, Group, LinkRow } from "@/components/settings/kit";
import { ThemePicker } from "@/components/settings/ThemePicker";
import { useApp, usePrimaryGoal } from "@/state/AppState";
import { useSettings } from "@/settings/store";
import { fmtDate } from "@/lib/format";
import { resetTours } from "@/tour/tours";

/**
 * SETTINGS — the account centre.
 *
 * Organised the way an athlete would look for something, not the way the data
 * is stored: who I am, how I get in, who can see me, what I do professionally,
 * my mountains, my data, what I pay, what I'm told, and how to get help.
 *
 * Every row is a title, one plain sentence, and a chevron. Nothing here is
 * nested more than two deep, and the destructive controls sit alone at the
 * bottom behind their own heading.
 */
export default function Settings() {
  const { user } = useApp();
  /* Purely so the row can say it did something — see the note on the row. */
  const [guidesCleared, setGuidesCleared] = useState(false);
  const { settings } = useSettings();
  const goal = usePrimaryGoal();

  const verified = Object.values(settings.verification).some((v) => v.status === "approved");
  const name = user.name?.trim() || "Athlete";
  const handle = settings.username.trim() || name.toLowerCase().replace(/[^a-z0-9]/g, "");

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader title="Settings" back="/profile" />
      </div>

      <Stagger className="px-5 pb-6">
        {/* ---- Who you are ------------------------------------------------
            NOT A CARD. This was `rounded-card border border-hairline bg-graphite
            p-4` — an outlined panel at the very top of the screen, where there
            is nothing above it to be separated FROM. It stood for no object,
            floated above nothing, and its edge told you nothing the top of the
            screen had not already said.

            So it is the athlete, on the page: the photograph, their name, and
            the mountain they are training for, in the same left gutter every
            row below uses. The one hairline it kept (between the name and the
            objective) is gone too — a person and their objective are the same
            subject, and space says "related" better than a rule does. */}
        <Rise>
          <div className="flex items-center gap-3.5">
            {/* Tapping the photo goes straight to the picker — the shortest
                path to the thing people most want to change. The circle keeps
                its edge: that is a photograph's own boundary, not a container
                drawn around a group of lines. */}
            <Link
              to="/settings/profile"
              aria-label="Change profile photo"
              className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-hairline bg-slate text-[18px] text-mist"
            >
              {(settings.avatar ?? user.avatar) ? (
                <img
                  src={settings.avatar ?? user.avatar}
                  alt=""
                  aria-hidden
                  className="h-full w-full object-cover"
                />
              ) : (
                name.slice(0, 1).toUpperCase()
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[20px] font-light text-snow">{name}</p>
              <p className="truncate text-[12px] text-mist">@{handle}</p>
              <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-mist">
                <ShieldCheck
                  size={13}
                  strokeWidth={1.8}
                  className={verified ? "text-azure" : "text-mist-dim"}
                />
                {verified ? "Verified" : "Not verified"}
              </p>
            </div>
          </div>

          {goal && (
            <p className="mt-4 text-[12.5px] text-mist">
              <span className="text-snow">{goal.name}</span> · {fmtDate(goal.targetDate)}
            </p>
          )}

          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <Link
              to="/profile"
              className="grid h-11 place-items-center rounded-pill border border-hairline-strong text-[12.5px] text-snow transition-colors hover:border-azure/50"
            >
              View profile
            </Link>
            <Link
              to="/settings/share"
              className="grid h-11 place-items-center rounded-pill border border-azure/45 bg-azure/[0.10] text-[12.5px] text-azure transition-colors hover:bg-azure/[0.16]"
            >
              Share profile
            </Link>
          </div>
        </Rise>

        {/* ---- Appearance, FIRST AND INLINE --------------------------------
            The owner asked for the theme "somewhere where it's easy… like on
            iPhones" (2026-09-04), and the reason it was not easy turned out to
            be worse than placement: the only theme control in the app lived in
            `screens/Settings.tsx`, which NOTHING IMPORTS. `/settings` renders
            THIS file. So the control existed, looked finished, and could not be
            reached from anywhere — the same class of fault as a comment that
            describes a control nobody built.

            It is inline rather than a row into `/settings/display`, and it
            leads the list rather than sitting with Data, because it is one tap
            from the Profile tab this way and because a phone puts the same
            choice at the top of its own display page. `ThemePicker` shows the
            themes rather than naming them, as a phone does. */}
        <Group label="Appearance">
          <div className="pt-1.5">
            <ThemePicker />
          </div>
        </Group>

        {/* ---- Profile ----------------------------------------------------
            No "Share profile" row here: it is one of the two buttons in the
            card directly above, and the list repeated it forty pixels lower.
            "Edit profile" stays, because the card only exposes it by tapping
            the avatar — which reads as "change my photo", not "edit
            everything". */}
        <Group label="Profile">
          <LinkRow
            to="/settings/profile"
            icon={User}
            title="Edit profile"
            detail="Your name, photo, bio, experience and what you're looking for."
          />
          <LinkRow
            to="/settings/verification"
            icon={BadgeCheck}
            title="Verification"
            detail="Have parts of your profile independently checked."
            value={verified ? "Verified" : undefined}
            tone="azure"
          />
          <LinkRow
            to="/settings/passport"
            icon={Award}
            title="Mountain Passport"
            detail="Open it, share it, and choose who can see it."
          />
        </Group>

        {/* ---- Account ---------------------------------------------------- */}
        <Group label="Account">
          <LinkRow
            to="/settings/account"
            icon={UserCog}
            title="Account details"
            detail="Email, phone, member ID and connected sign-in methods."
          />
          <LinkRow
            to="/settings/security"
            icon={Lock}
            title="Security"
            detail="Password, two-factor and the devices you're signed in on."
          />
        </Group>

        {/* ---- Privacy & safety ------------------------------------------- */}
        <Group label="Privacy & safety">
          <LinkRow
            to="/settings/privacy"
            icon={ShieldCheck}
            title="Privacy"
            detail="Control who can see your profile and mountain activity."
          />
          <LinkRow
            to="/settings/location"
            icon={MapPin}
            title="Location"
            detail="ICEFALL only ever uses an approximate position, and only if you allow it."
          />
          <LinkRow
            to="/settings/safety"
            icon={ShieldCheck}
            title="Safety"
            detail="Blocked people, reports, and how ICEFALL keeps interactions safe."
          />
        </Group>

        {/* ---- Professional ------------------------------------------------ */}
        <Group label="Professional">
          <LinkRow
            to="/settings/professional"
            icon={Sparkles}
            title="Professional Centre"
            detail="Apply as a guide or expedition partner, or for the Sherpa badge."
          />
        </Group>

        {/* ---- Mountains --------------------------------------------------- */}
        <Group label="Mountains">
          <LinkRow
            to="/settings/mountains"
            icon={MountainIcon}
            title="My mountains"
            detail="Your objectives, their dates, and which one comes first."
          />
          <LinkRow
            to="/settings/cv"
            icon={FileText}
            title="Mountain CV"
            detail="What you've actually climbed, assembled from your own records."
          />
        </Group>

        {/* ---- Activity & data --------------------------------------------- */}
        <Group label="Activity & data">
          <LinkRow
            to="/settings/data"
            icon={Database}
            title="Data & activity"
            detail="Export everything ICEFALL holds, or erase it."
          />
          <LinkRow
            to="/settings/devices"
            icon={Watch}
            title="Devices & apps"
            detail="Watches, health apps and anything else that could send data in."
          />
          {/* Separate from "Devices & apps" on purpose: that row is about data
              coming IN from a watch, this one is about an account ICEFALL sends
              activities OUT to. Same group, because both are "where else your
              training lives", but never the same row. */}
          <LinkRow
            to="/settings/connections"
            icon={Link2}
            title="Connected accounts"
            detail="Strava and other services linked to this account."
          />
          {/* The one place the ring's permission and readings live. It was
              reachable only from the Daily screen and Search, so every sentence
              that said "in Settings" about it was pointing at nothing. */}
          <LinkRow
            to="/settings/health-sources"
            icon={HeartPulse}
            title="Ring and health data"
            detail="Your Oura ring, its readings, and your permission for storing them."
          />
          <LinkRow
            to="/settings/offline"
            icon={CloudOff}
            title="Offline data"
            detail="What's stored on this device for use without a signal."
          />
        </Group>

        {/* ---- Membership --------------------------------------------------- */}
        <Group label="Membership">
          <LinkRow
            to="/settings/membership"
            icon={Award}
            title="Subscription"
            detail="Your plan, what it includes and how to change it."
          />
          <LinkRow
            to="/settings/referrals"
            icon={Share2}
            title="Expedition crew"
            detail="Invite people and earn Pro months when they subscribe."
          />
        </Group>

        {/* ---- Notifications ------------------------------------------------ */}
        <Group label="Notifications">
          <LinkRow
            to="/settings/notifications"
            icon={Bell}
            title="Notification preferences"
            detail="Choose exactly what ICEFALL is allowed to interrupt you for."
          />
        </Group>

        {/* ---- Support ------------------------------------------------------ */}
        <Group label="Support">
          <LinkRow
            to="/settings/support"
            icon={LifeBuoy}
            title="Help & support"
            detail="Get help, report a bug, or raise a safety issue."
          />
          {/* THE WAY BACK TO THE PAGE GUIDES.

              Home, Explore, recording, Coach and your profile each introduce
              themselves once, inline, on the first visit. Skipping one is
              permanent by design — a guide that returns on a timer is a popup
              with a delay — so this is the only way back to them, and without
              it a mistap costs the athlete the explanation for good.

              The row says what it does rather than "reset": nothing else is
              cleared, and no data goes with it. `guidesCleared` is feedback,
              not state: the guides reappear the next time each screen is
              opened, and this screen has none of its own to show it on. */}
          <ActionRow
            icon={Compass}
            title="Show the page guides again"
            detail="Home, Explore, recording, Coach and your profile each explain themselves once on the first visit. This brings all five back."
            value={guidesCleared ? "Cleared" : undefined}
            onClick={() => {
              resetTours();
              setGuidesCleared(true);
            }}
          />
        </Group>

        {/* ---- Legal & about ------------------------------------------------ */}
        <Group label="Legal">
          <LinkRow
            to="/settings/legal"
            icon={FileText}
            title="Terms & policies"
            detail="Terms, privacy, community guidelines, bookings and refunds."
          />
          <LinkRow
            to="/settings/about"
            icon={Info}
            title="About ICEFALL"
            detail="Version, credits and where the data comes from."
          />
        </Group>

        {/* ---- The end ------------------------------------------------------ */}
        <Group label="Account management">
          <LinkRow
            to="/settings/manage"
            icon={LogOut}
            title="Sign out or delete account"
            detail="Sign out of this device, or remove your account and its data."
            tone="danger"
          />
        </Group>
      </Stagger>
    </Screen>
  );
}
