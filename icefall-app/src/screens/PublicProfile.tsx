import { useMemo, useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookmarkCheck,
  Check,
  Download,
  Share2,
  Smartphone,
  UserPlus,
} from "lucide-react";
import { Button, Disclaimer, Stat, sharePage } from "@/components/ui/primitives";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { IcefallLockup } from "@/components/ui/IcefallMark";
import { BadgeHex } from "@/components/domain/BadgeHex";
import { BADGES } from "@/badges/model";
import { decodeProfile, type SharedProfile } from "@/profile/shareLink";
import { useSessionState } from "@/auth/session";
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
 *
 * ── NO MESSAGE BUTTON, CHECKED RATHER THAN ASSUMED (2026-09-08) ──────────────
 *
 * `@/messaging` landed and `AthleteProfile` gained a Message pill, so this page
 * was asked the same question. It cannot have one, for two reasons and either
 * is enough:
 *
 *   THERE IS NO SENDER. `messages_insert` is `sender_id = auth.uid()`. Whoever
 *     is reading this card has no session — anybody who does is redirected to
 *     the live profile a few lines below, before the card ever paints.
 *
 *   AND IT WOULD BE THE WRONG PRODUCT ANYWAY. A card is forwardable; a button
 *     on it is a channel into somebody's inbox opened by whoever the link
 *     reached last. The two disclaimers at the foot of this page have promised
 *     the opposite since before there was a messaging layer to break it with.
 *
 * The honest route is the one already here: sign in, land on the real profile,
 * and message from there. Nothing on this page should offer a shortcut past it.
 *
 * (The third reason this paragraph used to give — that the link carries a
 * handle and a handle is not a person — was true of the link and NOT of the
 * redirect below, which was sending signed-in readers to a profile keyed by
 * that same handle. `SharedProfile.id` now carries the account and the redirect
 * uses it; the two arguments agree again.)
 */
export default function PublicProfile() {
  const { hash } = useLocation();
  const profile = useMemo(() => decodeProfile(hash), [hash]);
  const session = useSessionState();
  const navigate = useNavigate();

  /*
   * A SHARED LINK NOW OPENS THE REAL PROFILE — for anybody who has an account.
   *
   * This card carries its whole contents inside the link, which is what makes it
   * work with no account, no server and no signal. That was the only option when
   * ICEFALL had no server. It has one now, and the card's weakness became the
   * important thing: THE CARD IS A PHOTOGRAPH, NOT A WINDOW. It is frozen at the
   * moment it was shared, so changing your objective leaves every link you ever
   * sent showing the old one, for ever, with no way to correct it. The two also
   * drifted — the card shows an objective and a summit count, the real profile
   * deliberately shows neither, because it cannot read those about another
   * person. One app was giving two different answers about the same climber.
   *
   * So: if the reader is SIGNED IN, send them to the live profile, keyed by the
   * handle the card already carries. If they are not, they see the card, which
   * is exactly what it is for — a stranger with no account still gets something
   * real rather than a sign-up wall.
   *
   * `replace` so the card does not sit in history: tapping back from the profile
   * should leave, not bounce through a frozen copy of the same person.
   */
  /*
   * ON THE ACCOUNT ID WHERE THE CARD CARRIES ONE, AND ONLY THEN.
   *
   * `/social/people/:id` takes either, and they are not equivalent: a handle
   * link points at a NAME and an id link points at a PERSON. A card is
   * forwardable and outlives the reason it was shared, so an old link whose
   * handle has since been given up and re-claimed would land a signed-in reader
   * on a STRANGER'S profile — which now carries a Message control, turning the
   * wrong page into the wrong recipient. `SharedProfile.id` closes that for
   * every card made from now on.
   *
   * A card made before the id existed keeps the card. It is frozen and it says
   * so, which is a smaller wrong than sending somebody to a profile that may
   * not be the person they were shown, with a way to write to them on it.
   */
  useEffect(() => {
    if (session && profile?.id) {
      navigate(`/social/people/${encodeURIComponent(profile.id)}`, { replace: true });
    }
  }, [session, profile?.id, navigate]);
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
            THE ONE BOX ON THIS SCREEN THAT IS NOT A BOX — it is the artefact.
            The owner's rule strips a border wherever its only message is "these
            lines belong together", and every other outline on this page has
            gone for that reason. This one stays because the page is not a page
            about a climber: it is a CARD, in the sense the copy at the foot uses
            the word — a frozen snapshot that travelled inside a link, that can
            be saved to a file, and whose whole premise is that it was cut loose
            from the app at the moment it was shared. Its edge is the artefact's
            own, the same exemption `ShareActivity` and the passport hold, and
            deleting it would leave two disclaimers describing something that is
            no longer on screen.

            `overflow-hidden` on the card was clipping the avatar, which lifts
            out of the banner with a negative margin — the top of the circle was
            sliced off by the card's own rounded corner. Only the BANNER needs
            clipping, so the clip moved in there and the card no longer crops
            anything that overlaps it.
          */}
          <div className="rounded-card border border-azure/30 bg-graphite">
            {/* ---- Card head --------------------------------------------- */}
            <div className="relative h-[170px] overflow-hidden rounded-t-card">
              <img
                src={banner}
                alt=""
                aria-hidden
                className="h-full w-full object-cover opacity-60"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-graphite via-graphite/50 to-transparent" />
              <IcefallLockup className="absolute left-4 top-4 h-7 text-snow/85" />
            </div>

            <div className="relative -mt-10 px-5 pb-5">
              <span className="grid h-[72px] w-[72px] place-items-center overflow-hidden rounded-full border-[3px] border-graphite bg-slate text-[22px] text-mist shadow-lg">
                {profile.avatar ? (
                  <img
                    src={profile.avatar}
                    alt=""
                    aria-hidden
                    className="h-full w-full object-cover"
                  />
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

              {/* ---- Objective -------------------------------------------
                  A box inside the card was a second frame inside a frame. The
                  label, the space above it and one azure rule say the same
                  thing without drawing a rectangle round three lines — and
                  azure is right here for the reason it is right everywhere:
                  the objective is the climber's own. */}
              {profile.objective && (
                <div className="mt-5 border-l border-azure/30 pl-3.5">
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

              {/* ---- Record ----------------------------------------------
                  A row of figures with quiet labels, and ONE hairline above
                  them, because that is a real division: what the climber wrote
                  ends here and what was counted begins. */}
              <div className="mt-5 grid grid-cols-3 gap-x-5 gap-y-4 border-t border-hairline pt-4">
                <Stat
                  size="lg"
                  label="Summits"
                  value={profile.summits != null ? String(profile.summits) : "—"}
                />
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
        <Rise className="pt-7">
          <div className="space-y-2.5">
            <Button
              className="w-full"
              onClick={() => (saved ? forget(profile.handle) : save(profile))}
            >
              {saved ? (
                <BookmarkCheck size={15} strokeWidth={1.9} />
              ) : (
                <UserPlus size={15} strokeWidth={1.8} />
              )}
              {/*
                SAVE, NOT FOLLOW. `profile/following.ts` states the rule in its own
                header — "the card is SAVED, not followed" — and this label had
                drifted from it. Nothing is notified and no feed is subscribed to:
                the card is kept on this device so the person is there when ICEFALL
                is opened, rather than lost in a chat thread.

                A real follow needs an account, and anybody holding one is now
                redirected to the live profile before they ever reach this card —
                so "Follow" here could only ever name something that did not happen.
              */}
              {saved ? "Card saved" : `Save ${profile.name.split(" ")[0]}'s card`}
            </Button>

            {mode === "installed" ? (
              <Link to="/social" className="block">
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
                {copied ? (
                  <Check size={15} strokeWidth={2} />
                ) : (
                  <Share2 size={15} strokeWidth={1.8} />
                )}
                {copied ? "Copied" : "Share"}
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => saveCard(profile)}>
                <Download size={15} strokeWidth={1.8} />
                Save
              </Button>
            </div>
          </div>

          {saved && (
            <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">{FOLLOW_NOTICE}</p>
          )}

          {mode === "manual-ios" && (
            /* Instructions, not an object: one rule and the steps beside it. */
            <div className="mt-4 border-l border-azure/30 pl-3.5">
              <p className="flex items-center gap-2 text-[12.5px] text-snow">
                <Smartphone size={14} strokeWidth={1.8} className="text-azure" />
                Get ICEFALL on this iPhone
              </p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-dim">
                {IOS_INSTALL_STEPS}
              </p>
            </div>
          )}
        </Rise>

        <Rise className="pt-9">
          <Disclaimer>
            This card travelled inside the link itself, so it opens anywhere and was never sent to a
            server. It is a snapshot from{" "}
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
            A shared ICEFALL profile carries its contents inside the link, so the link has to arrive
            whole. Messaging apps sometimes cut long links in half — ask for it again, or have it
            sent as an attachment rather than as text.
          </p>
          <Link to="/" className="mt-5 inline-block">
            <Button>Open ICEFALL</Button>
          </Link>
        </Rise>
      </Stagger>
    </Screen>
  );
}
