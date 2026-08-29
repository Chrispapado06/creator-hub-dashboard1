import { Link } from "react-router-dom";
import {
  Award, Bell, BadgeCheck, Database, FileText, HeartPulse, Info, LifeBuoy, Lock,
  LogOut, MapPin, Mountain as MountainIcon, Share2, ShieldCheck, Sparkles, User,
  UserCog, Watch,
} from "lucide-react";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { Group, LinkRow } from "@/components/settings/kit";
import { useApp, usePrimaryGoal } from "@/state/AppState";
import { useSettings } from "@/settings/store";
import { fmtDate } from "@/lib/format";

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
        {/* ---- Who you are ------------------------------------------------ */}
        <Rise>
          <div className="rounded-card border border-hairline bg-graphite p-4">
            <div className="flex items-center gap-3.5">
              {/* Tapping the photo goes straight to the picker — the shortest
                  path to the thing people most want to change. */}
              <Link
                to="/settings/profile"
                aria-label="Change profile photo"
                className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full border border-hairline bg-slate text-[16px] text-mist">
                {settings.avatar ?? user.avatar ? (
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
                <p className="truncate text-[17px] text-snow">{name}</p>
                <p className="truncate text-[12px] text-mist-dim">@{handle}</p>
                <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-mist">
                  <BadgeCheck
                    size={13}
                    strokeWidth={1.8}
                    className={verified ? "text-azure" : "text-mist-dim"}
                  />
                  {verified ? "Verified" : "Not verified"}
                </p>
              </div>
            </div>

            {goal && (
              <p className="mt-3.5 border-t border-hairline pt-3 text-[12.5px] text-mist">
                <span className="text-snow">{goal.name}</span> · {fmtDate(goal.targetDate)}
              </p>
            )}

            <div className="mt-3.5 grid grid-cols-2 gap-2.5">
              <Link
                to="/profile"
                className="grid h-10 place-items-center rounded-pill border border-hairline-strong text-[12.5px] text-snow transition-colors hover:border-azure/50"
              >
                View profile
              </Link>
              <Link
                to="/settings/share"
                className="grid h-10 place-items-center rounded-pill border border-azure/45 bg-azure/[0.10] text-[12.5px] text-azure transition-colors hover:bg-azure/[0.16]"
              >
                Share profile
              </Link>
            </div>
          </div>
        </Rise>

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
          <LinkRow
            to="/settings/offline"
            icon={HeartPulse}
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
