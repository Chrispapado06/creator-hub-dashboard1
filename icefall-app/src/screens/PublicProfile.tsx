import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight, BookmarkCheck, Check, Download, Share2, Smartphone, UserPlus,
} from "lucide-react";
import { Button, Disclaimer, Stat, sharePage } from "@/components/ui/primitives";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { IcefallLockup } from "@/components/ui/IcefallMark";
import { BadgeHex } from "@/components/domain/BadgeHex";
import { BADGES } from "@/badges/model";
import { decodeProfile, type SharedProfile } from "@/profile/shareLink";
import { bannerFor } from "@/profile/banners";
import { FOLLOW_NOTICE, useFollowing } from "@/profile/following";
import { IOS_INSTALL_STEPS, useInstall } from "@/lib/install";
import { fmtElevation } from "@/lib/format";

/**
 * The page a shared profile link opens.
 *
 * Everything on it came out of the link's fragment — see `shareLink.ts` — so it
 * works with no account, no server and no connection. It is deliberately a
 * CARD, not a profile: there is no feed, no message box and no way to reach the
 * person from here, because a link anyone can forward must not be a channel
 * into somebody's inbox.
 */
export default function PublicProfile() {
  const { hash } = useLocation();
  const profile = useMemo(() => decodeProfile(hash), [hash]);
  const [copied, setCopied] = useState(false);
  const { mode, install } = useInstall();
  const { isSaved, save, forget } = useFollowing();

  if (!profile) return <Unreadable />;

  const badges = BADGES.filter((b) => profile.badges?.includes(b.id));
  const saved = isSaved(profile.handle);
  const banner = bannerFor(profile.handle);

  return (
    <Screen padded={false}>
      <Stagger className="px-5 pb-8 pt-6">
        <Rise>
          {/*
            `overflow-hidden` on the card was clipping the avatar, which lifts
            out of the banner with a negative margin — the top of the circle was
            sliced off by the card's own rounded corner. Only the BANNER needs
            clipping, so the clip moved in there and the card no longer crops
            anything that overlaps it.
          */}
          <div className="rounded-card border border-azure/30 bg-graphite">
            {/* ---- Card head --------------------------------------------- */}
            <div className="relative h-[170px] overflow-hidden rounded-t-card">
              <img src={banner} alt="" aria-hidden className="h-full w-full object-cover opacity-60" />
              <div className="absolute inset-0 bg-gradient-to-t from-graphite via-graphite/50 to-transparent" />
              <IcefallLockup className="absolute left-4 top-4 h-7 text-snow/85" />
            </div>

            <div className="relative -mt-10 px-5 pb-5">
              <span className="grid h-[72px] w-[72px] place-items-center overflow-hidden rounded-full border-[3px] border-graphite bg-slate text-[22px] text-mist shadow-lg">
                {profile.avatar ? (
                  <img src={profile.avatar} alt="" aria-hidden className="h-full w-full object-cover" />
                ) : (
                  profile.name.slice(0, 1).toUpperCase()
                )}
              </span>

              <h1 className="mt-3 text-[26px] font-light leading-tight text-snow">
                {profile.name}
              </h1>
              <p className="text-[12.5px] text-mist-dim">@{profile.handle}</p>

              {badges.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {badges.map((b) => (
                    <span
                      key={b.id}
                      className="flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-obsidian/60 py-1 pl-1 pr-2.5"
                    >
                      <BadgeHex badge={b} size={20} />
                      <span className="text-[11px] text-snow">{b.name}</span>
                    </span>
                  ))}
                </div>
              )}

              {profile.bio && (
                <p className="mt-3 text-[12.5px] leading-relaxed text-mist">{profile.bio}</p>
              )}
              {profile.region && (
                <p className="mt-1.5 text-[12px] text-mist-dim">{profile.region}</p>
              )}

              {/* ---- Objective ------------------------------------------- */}
              {profile.objective && (
                <div className="mt-4 rounded-tile border border-azure/35 bg-azure/[0.06] p-3.5">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-azure/85">
                    Current objective
                  </p>
                  <p className="mt-1.5 text-[16px] text-snow">{profile.objective.name}</p>
                  <p className="tnum mt-0.5 text-[12px] text-mist">
                    {profile.objective.when} · {Math.round(profile.objective.preparationPct)}%
                    prepared
                  </p>
                </div>
              )}

              {/* ---- Record ---------------------------------------------- */}
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-hairline pt-4">
                <Stat size="lg" label="Summits" value={profile.summits != null ? String(profile.summits) : "—"} />
                <Stat
                  size="lg"
                  label="Highest"
                  value={profile.highestM ? `${fmtElevation(profile.highestM)} m` : "—"}
                />
                <Stat
                  size="lg"
                  label="Prepared"
                  value={
                    profile.objective ? `${Math.round(profile.objective.preparationPct)}%` : "—"
                  }
                />
              </div>
            </div>
          </div>
        </Rise>

        {/* ---- What you can do with this ---------------------------------
            Two paths, and which one leads depends on whether ICEFALL is already
            on the phone. Somebody who has the app should land in it; somebody
            who does not should be able to get it in one tap where the browser
            allows that, and be told the actual steps where it does not. */}
        <Rise className="pt-5">
          <div className="space-y-2.5">
            <Button
              className="w-full"
              onClick={() => (saved ? forget(profile.handle) : save(profile))}
            >
              {saved ? <BookmarkCheck size={15} strokeWidth={1.9} /> : <UserPlus size={15} strokeWidth={1.8} />}
              {saved ? `Following ${profile.name.split(" ")[0]}` : `Follow ${profile.name.split(" ")[0]}`}
            </Button>

            {mode === "installed" ? (
              <Link to="/explore/social" className="block">
                <Button variant="secondary" className="w-full">
                  Open in ICEFALL
                  <ArrowRight size={15} strokeWidth={1.8} />
                </Button>
              </Link>
            ) : mode === "prompt" ? (
              <Button variant="secondary" className="w-full" onClick={() => void install()}>
                <Smartphone size={15} strokeWidth={1.8} />
                Install ICEFALL
              </Button>
            ) : (
              <Link to="/" className="block">
                <Button variant="secondary" className="w-full">
                  Open ICEFALL
                  <ArrowRight size={15} strokeWidth={1.8} />
                </Button>
              </Link>
            )}

            <div className="flex gap-2.5">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  sharePage(`${profile.name} · ICEFALL`);
                  if (!navigator.share) setCopied(true);
                }}
              >
                {copied ? <Check size={15} strokeWidth={2} /> : <Share2 size={15} strokeWidth={1.8} />}
                {copied ? "Copied" : "Share"}
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => saveCard(profile)}>
                <Download size={15} strokeWidth={1.8} />
                Save
              </Button>
            </div>
          </div>

          {saved && <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">{FOLLOW_NOTICE}</p>}

          {mode === "manual-ios" && (
            <div className="mt-3 rounded-tile border border-hairline bg-graphite p-3.5">
              <p className="flex items-center gap-2 text-[12.5px] text-snow">
                <Smartphone size={14} strokeWidth={1.8} className="text-azure" />
                Get ICEFALL on this iPhone
              </p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-dim">{IOS_INSTALL_STEPS}</p>
            </div>
          )}
        </Rise>

        <Rise className="pt-5">
          <Disclaimer>
            This card travelled inside the link itself, so it opens anywhere and was never sent to
            a server. It is a snapshot from{" "}
            {new Date(profile.at).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}{" "}
            — it does not update, and it carries no contact details, no age and no location beyond
            the region shown.
          </Disclaimer>
          <Disclaimer className="mt-3">
            ICEFALL does not check anyone's identity, experience or qualifications, and a badge
            records only that one specific thing was checked. Nothing on this card is a
            recommendation of a person, and there is deliberately no way to message someone from a
            link that anyone can forward.
          </Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
}


/** Saves the card as a small JSON file — the only export that needs no server. */
function saveCard(profile: SharedProfile) {
  const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `icefall-${profile.handle || "profile"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function Unreadable() {
  return (
    <Screen>
      <Stagger className="pt-10">
        <Rise>
          <IcefallLockup className="h-8 text-snow/80" />
          <h1 className="mt-6 text-[22px] font-light text-snow">This card can't be read.</h1>
          <p className="mt-2 text-[12.5px] leading-relaxed text-mist">
            A shared ICEFALL profile carries its contents inside the link, so the link has to
            arrive whole. Messaging apps sometimes cut long links in half — ask for it again, or
            have it sent as an attachment rather than as text.
          </p>
          <Link to="/" className="mt-5 inline-block">
            <Button>Open ICEFALL</Button>
          </Link>
        </Rise>
      </Stagger>
    </Screen>
  );
}
