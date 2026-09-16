import { useNavigate } from "react-router-dom";

import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { CreateGroupCard, useGroupPrivacy } from "@/screens/explore/Groups";

/**
 * START A GROUP — `/social/groups/new`.
 *
 * ── WHAT THIS ROUTE USED TO BE, AND WHY IT IS NOT THAT ANY MORE ─────────────
 * Until slice S7 this path rendered `CreateExpedition`, which made an
 * `Expedition` — a plan held on one phone, with a party of exactly one member
 * and no way for anybody else to open it. There is now ONE kind of group
 * (structure plan D1): a row in `public.groups`, on ICEFALL's server, that
 * other people can find, ask to join, and talk in. So this route renders the
 * server form, and there is no longer a second form making a second record
 * that shares the word "group".
 *
 * Every door into creating a group lands here — the + on Social's Groups tab,
 * the pill under the groups list, the empty state on People, and the legacy
 * `/explore/groups/new` and `/explore/crew/new` redirects. The form itself is
 * `CreateGroupCard` in `screens/explore/Groups.tsx`; it is not copied, so the
 * doors cannot drift apart.
 *
 * ── THE PAGE OWNS THE TITLE AND THE WAY BACK ────────────────────────────────
 * `titleRow={false}` suppresses the form's own heading row and its Close,
 * because on a route of its own the `ScreenHeader` below is the title and its
 * chevron is the way out. Two headings and two Closes over one form is two
 * answers to "how do I leave this".
 *
 * THE CHEVRON NAMES THE GROUPS LIST rather than going back in history. This is
 * the one screen of Social's that is only ever reached from that list — see the
 * routing note in `App.tsx` — and a redirect chain (`/explore/crew/new`) has no
 * useful history entry to return to.
 */
export default function CreateGroupPage() {
  const navigate = useNavigate();
  /* The same read the Groups tab makes, so the form knows before the button is
     pressed whether the server can take a group at all. */
  const { privacy } = useGroupPrivacy();

  return (
    <Screen>
      <ScreenHeader
        title="Start a group"
        subtitle="On ICEFALL, for other people to join"
        back="/social?tab=groups"
      />

      {/* `Rise` IS THE DIRECT CHILD. `Stagger` propagates its variants to direct
          children only, so a component element here would sit at opacity 0 —
          in the DOM, no error, tsc green. */}
      <Stagger className="pb-24">
        <Rise>
          <CreateGroupCard
            privacy={privacy}
            titleRow={false}
            onClose={() => navigate("/social?tab=groups")}
          />
        </Rise>
      </Stagger>
    </Screen>
  );
}
