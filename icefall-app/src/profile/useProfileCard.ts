import { useMemo } from "react";
import { BADGES, badgeState } from "@/badges/model";
import { useMyProfile } from "@/auth/useMyProfile";
import { useSettings } from "@/settings/store";
import { useApp } from "@/state/AppState";
import { fmtDate } from "@/lib/format";
import type { SharedProfile } from "@/profile/shareLink";
import type { ProfileCardData } from "@/share/renderCard";

/**
 * The one description of "this athlete, as they publish themselves".
 *
 * TWO SURFACES READ IT AND THEY MUST NOT DISAGREE. `screens/Profile.tsx` builds
 * the link somebody opens; `screens/profile/ShareProfile.tsx` draws the image
 * somebody looks at. Those were about to be two hand-assembled copies of the
 * same twelve fields — the arrangement that already produced a follower count
 * reading "not measured" on one screen and a real number on another (see the
 * long note in `Profile.tsx`). One builder, two consumers.
 *
 * WHAT IT WILL NOT CARRY, and why:
 *
 *   · NO EMAIL, NO PHONE, NO COORDINATE, NO DATE OF BIRTH. `SharedProfile` has
 *     no field for any of them, and neither does the card. A region name is the
 *     finest location either object can express, so no amount of sharing can
 *     narrow it to an address.
 *   · NO PASSPORT. The owner removed it from the shared surface on 2 Sep —
 *     "just remove passport when sharing the profile" — and an exported PNG is
 *     the most shareable surface there is. It stays on the athlete's own page.
 *   · NO PREPARATION PERCENTAGE ON THE IMAGE. See `ProfileCardData` in
 *     `share/renderCard.ts`. It stays on `SharedProfile`, which is read inside
 *     the app on a page that can explain it; a PNG cannot.
 *   · NO FOLLOWER COUNT. It is a fact about an account rather than about a
 *     climber, and it is the one figure on the profile that is as often "not
 *     measured" as it is a number — a card that sometimes prints a figure and
 *     sometimes an em dash for the same row is a worse object than one that
 *     never claims it.
 *
 * EVERYTHING IS MEMOISED TOGETHER, deliberately. `ShareProfile` re-renders the
 * canvas whenever the card changes, so a freshly built object on every render
 * would be a render loop rather than a performance note. The dependencies are
 * all memoised or `useState`-held upstream (`user` and `goals` in AppState,
 * `settings` in the settings store, `useMyProfile`'s own state), so this holds.
 */
export interface ProfileCardSources {
  /** What travels inside a shared link. */
  shared: SharedProfile;
  /** What the canvas draws. Holds the photographs the link cannot carry. */
  card: ProfileCardData;
}

export function useProfileCard(): ProfileCardSources {
  const { user, goals, currentTier } = useApp();
  const { settings } = useSettings();
  const my = useMyProfile();

  /*
   * THE HANDLE COMES FROM THE SERVER, and nothing here invents one — the same
   * rule `Profile.tsx` states at length. `settings.username` is honoured only
   * because it is what this device last saw; a display name is never slugged
   * into an identifier somebody else might already hold.
   */
  const serverHandle = my.status === "ready" ? my.profile.username : null;
  const serverId = my.status === "ready" ? my.profile.id : null;

  return useMemo<ProfileCardSources>(() => {
    const handle = serverHandle ?? settings.username ?? null;
    const objective = goals.find((g) => g.status === "active");
    const highestM = user.summits.reduce((m, s) => Math.max(m, s.elevationM ?? 0), 0);
    const earnedBadges = BADGES.filter(
      (b) => badgeState(b, settings, currentTier).kind === "earned",
    );
    const region = settings.region || user.homeBase || undefined;

    const shared: SharedProfile = {
      v: 1,
      name: user.name,
      handle: handle ?? "",
      // The account, so a link keeps pointing at this climber even if they
      // change their handle. Absent when the server has not answered — a made-up
      // id would be worse than none, and the card still opens without one.
      id: serverId ?? undefined,
      bio: settings.bio || undefined,
      region,
      objective: objective
        ? {
            name: objective.name,
            when: fmtDate(objective.targetDate, { day: undefined }),
            preparationPct: objective.preparation,
          }
        : undefined,
      summits: user.summits.length,
      highestM: highestM || undefined,
      badges: earnedBadges.map((b) => b.id),
      at: new Date().toISOString(),
    };

    const card: ProfileCardData = {
      name: user.name,
      handle: handle ?? undefined,
      bio: settings.bio || undefined,
      region,
      objective: objective
        ? { name: objective.name, when: fmtDate(objective.targetDate, { day: undefined }) }
        : undefined,
      /*
       * `|| undefined`, not `?? undefined`: nought logged summits is an absence
       * on a card, not an achievement of zero. The renderer drops any figure it
       * is not given rather than printing a nought into the layout.
       */
      summitsLogged: user.summits.length || undefined,
      highestLoggedM: highestM || undefined,
      badgeNames: earnedBadges.map((b) => b.name),
      /*
       * The photographs, which are exactly what a link cannot carry: an avatar
       * data URL made a shared link 46,039 characters long (see `shareLink.ts`),
       * which is why the link drops it and why the image is worth drawing at all.
       */
      avatarSrc: settings.avatar || undefined,
      photoSrc: settings.cover || objective?.photo || "/img/mont-blanc-2.jpg",
    };

    return { shared, card };
  }, [user, goals, settings, currentTier, serverHandle, serverId]);
}
