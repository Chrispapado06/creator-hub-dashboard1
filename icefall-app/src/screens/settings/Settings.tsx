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
  Dumbbell,
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
import { ActionRow, ChoiceRow, Group, LinkRow } from "@/components/settings/kit";
import { ThemePicker } from "@/components/settings/ThemePicker";
import { CoachLanguagePicker } from "@/components/settings/CoachLanguagePicker";
import { AppLanguagePicker } from "@/components/settings/AppLanguagePicker";
import { useApp, usePrimaryGoal } from "@/state/AppState";
import { useSettings } from "@/settings/store";
import { fmtDate } from "@/lib/format";
import { resetTours } from "@/tour/tours";
import { useAppStrings } from "@/i18n";

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
  const t = useAppStrings();

  const verified = Object.values(settings.verification).some((v) => v.status === "approved");
  const name = user.name?.trim() || "Athlete";
  const handle = settings.username.trim() || name.toLowerCase().replace(/[^a-z0-9]/g, "");

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader title={t.settings.title} back="/profile" />
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
                {verified ? t.settings.verified : t.settings.notVerified}
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
              {t.settings.viewProfile}
            </Link>
            <Link
              to="/settings/share"
              className="grid h-11 place-items-center rounded-pill border border-azure/45 bg-azure/[0.10] text-[12.5px] text-azure transition-colors hover:bg-azure/[0.16]"
            >
              {t.settings.shareProfile}
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
        <Group label={t.settings.groups.appearance}>
          <div className="pt-1.5">
            <ThemePicker />
          </div>
          <HomeLayoutChoice />
        </Group>

        {/* ---- The coach's language ---------------------------------------
            Beside Appearance rather than under Coach, because it is a choice
            about how the app speaks to you and that is where a phone puts it.
            It changes the coach's prose only: the interface stays English, and
            the control says so above the list rather than leaving somebody to
            tap Español and wonder why the tab bar did not move. */}
        <Group label={t.settings.groups.coachLanguage}>
          <CoachLanguagePicker />
        </Group>

        {/* ---- The app's own language ---------------------------------------
            A second, DIFFERENT control right underneath the first, because the
            two answer different questions and sitting them side by side is the
            only way to make that obvious rather than leaving somebody to guess
            which one they just changed. See `@/i18n` for the string-lookup
            system this reads from, and `AppLanguagePicker` for why a language
            change reloads the page exactly the way a theme change does. */}
        <Group label={t.settings.groups.appLanguage}>
          <AppLanguagePicker />
        </Group>

        {/* ---- Profile ----------------------------------------------------
            No "Share profile" row here: it is one of the two buttons in the
            card directly above, and the list repeated it forty pixels lower.
            "Edit profile" stays, because the card only exposes it by tapping
            the avatar — which reads as "change my photo", not "edit
            everything". */}
        <Group label={t.settings.groups.profile}>
          <LinkRow
            to="/settings/profile"
            icon={User}
            title={t.settings.rows.editProfile.title}
            detail={t.settings.rows.editProfile.detail}
          />
          <LinkRow
            to="/settings/verification"
            icon={BadgeCheck}
            title={t.settings.rows.verification.title}
            detail={t.settings.rows.verification.detail}
            value={verified ? t.settings.verified : undefined}
            tone="azure"
          />
          <LinkRow
            to="/settings/passport"
            icon={Award}
            title={t.settings.rows.passport.title}
            detail={t.settings.rows.passport.detail}
          />
        </Group>

        {/* ---- Account ---------------------------------------------------- */}
        <Group label={t.settings.groups.account}>
          <LinkRow
            to="/settings/account"
            icon={UserCog}
            title={t.settings.rows.accountDetails.title}
            detail={t.settings.rows.accountDetails.detail}
          />
          <LinkRow
            to="/settings/security"
            icon={Lock}
            title={t.settings.rows.security.title}
            detail={t.settings.rows.security.detail}
          />
        </Group>

        {/* ---- Privacy & safety ------------------------------------------- */}
        <Group label={t.settings.groups.privacySafety}>
          <LinkRow
            to="/settings/privacy"
            icon={ShieldCheck}
            title={t.settings.rows.privacy.title}
            detail={t.settings.rows.privacy.detail}
          />
          <LinkRow
            to="/settings/location"
            icon={MapPin}
            title={t.settings.rows.location.title}
            detail={t.settings.rows.location.detail}
          />
          <LinkRow
            to="/settings/safety"
            icon={ShieldCheck}
            title={t.settings.rows.safety.title}
            detail={t.settings.rows.safety.detail}
          />
        </Group>

        {/* ---- Professional ------------------------------------------------ */}
        <Group label={t.settings.groups.professional}>
          <LinkRow
            to="/settings/professional"
            icon={Sparkles}
            title={t.settings.rows.professionalCentre.title}
            detail={t.settings.rows.professionalCentre.detail}
          />
        </Group>

        {/* ---- Mountains --------------------------------------------------- */}
        <Group label={t.settings.groups.mountains}>
          {/* FIRST IN THIS GROUP DELIBERATELY. Every answer in it changes what
              ICEFALL prescribes, and until this screen existed there was no way
              to change any of them — the questionnaire asked once and that was
              the end of it. */}
          <LinkRow
            to="/settings/coaching"
            icon={Dumbbell}
            title={t.settings.rows.coachingProfile.title}
            detail={t.settings.rows.coachingProfile.detail}
          />
          <LinkRow
            to="/settings/mountains"
            icon={MountainIcon}
            title={t.settings.rows.myMountains.title}
            detail={t.settings.rows.myMountains.detail}
          />
          <LinkRow
            to="/settings/cv"
            icon={FileText}
            title={t.settings.rows.mountainCV.title}
            detail={t.settings.rows.mountainCV.detail}
          />
        </Group>

        {/* ---- Activity & data --------------------------------------------- */}
        <Group label={t.settings.groups.activityData}>
          <LinkRow
            to="/settings/data"
            icon={Database}
            title={t.settings.rows.dataActivity.title}
            detail={t.settings.rows.dataActivity.detail}
          />
          <LinkRow
            to="/settings/devices"
            icon={Watch}
            title={t.settings.rows.devicesApps.title}
            detail={t.settings.rows.devicesApps.detail}
          />
          {/* Separate from "Devices & apps" on purpose: that row is about data
              coming IN from a watch, this one is about an account ICEFALL sends
              activities OUT to. Same group, because both are "where else your
              training lives", but never the same row. */}
          <LinkRow
            to="/settings/connections"
            icon={Link2}
            title={t.settings.rows.connectedAccounts.title}
            detail={t.settings.rows.connectedAccounts.detail}
          />
          {/* The one place the ring's permission and readings live. It was
              reachable only from the Daily screen and Search, so every sentence
              that said "in Settings" about it was pointing at nothing. */}
          <LinkRow
            to="/settings/health-sources"
            icon={HeartPulse}
            title={t.settings.rows.ringHealth.title}
            detail={t.settings.rows.ringHealth.detail}
          />
          <LinkRow
            to="/settings/offline"
            icon={CloudOff}
            title={t.settings.rows.offlineData.title}
            detail={t.settings.rows.offlineData.detail}
          />
        </Group>

        {/* ---- Membership --------------------------------------------------- */}
        <Group label={t.settings.groups.membership}>
          <LinkRow
            to="/settings/membership"
            icon={Award}
            title={t.settings.rows.subscription.title}
            detail={t.settings.rows.subscription.detail}
          />
          <LinkRow
            to="/settings/referrals"
            icon={Share2}
            title={t.settings.rows.referrals.title}
            detail={t.settings.rows.referrals.detail}
          />
        </Group>

        {/* ---- Notifications ------------------------------------------------ */}
        <Group label={t.settings.groups.notifications}>
          <LinkRow
            to="/settings/notifications"
            icon={Bell}
            title={t.settings.rows.notificationPrefs.title}
            detail={t.settings.rows.notificationPrefs.detail}
          />
        </Group>

        {/* ---- Support ------------------------------------------------------ */}
        <Group label={t.settings.groups.support}>
          <LinkRow
            to="/settings/support"
            icon={LifeBuoy}
            title={t.settings.rows.helpSupport.title}
            detail={t.settings.rows.helpSupport.detail}
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
            title={t.settings.rows.showGuides.title}
            detail={t.settings.rows.showGuides.detail}
            value={guidesCleared ? t.settings.rows.showGuides.cleared : undefined}
            onClick={() => {
              resetTours();
              setGuidesCleared(true);
            }}
          />
        </Group>

        {/* ---- Legal & about ------------------------------------------------ */}
        <Group label={t.settings.groups.legal}>
          <LinkRow
            to="/settings/legal"
            icon={FileText}
            title={t.settings.rows.legalDocs.title}
            detail={t.settings.rows.legalDocs.detail}
          />
          <LinkRow
            to="/settings/about"
            icon={Info}
            title={t.settings.rows.about.title}
            detail={t.settings.rows.about.detail}
          />
        </Group>

        {/* ---- The end ------------------------------------------------------ */}
        <Group label={t.settings.groups.accountManagement}>
          <LinkRow
            to="/settings/manage"
            icon={LogOut}
            title={t.settings.rows.manage.title}
            detail={t.settings.rows.manage.detail}
            tone="danger"
          />
        </Group>
      </Stagger>
    </Screen>
  );
}

/** New Home or the one it replaced — kept at the owner's request (2026-09-16). */
function HomeLayoutChoice() {
  const { settings, patch } = useSettings();
  return (
    <ChoiceRow
      title="Home layout"
      options={[
        { value: "new", label: "New" },
        { value: "classic", label: "Classic" },
      ]}
      value={settings.homeLayout ?? "new"}
      onChange={(v) => patch({ homeLayout: v })}
    />
  );
}
