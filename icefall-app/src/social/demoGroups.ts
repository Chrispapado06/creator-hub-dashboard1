import { DEMO } from "@/offline/offline";
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";

/**
 * Demo groups, for reviewing the Groups layout.
 *
 * A group in ICEFALL is ABOUT A MOUNTAIN — you add one you want to climb and it
 * shows you who else wants it. That is the owner's own definition and it is the
 * half of the original flight note that the 1:1 mockups did NOT supersede.
 *
 * NOTHING HERE IS REAL. The member and post counts are written numbers, not
 * measurements, and every screen showing them must carry `GROUPS_DEMO_NOTICE`.
 * The day a backend exists these are replaced by a fetch and the notice goes.
 */
export interface DemoGroup {
  id: string;
  name: string;
  /** The mountain the group is organised around. */
  mountain: string;
  cover: string;
  members: number;
  posts: number;
  /** Invite-only groups carry a lock in the card, like the mockup. */
  private: boolean;
  joined: boolean;
}

export const SHOW_DEMO_GROUPS = SHOW_DEMO_DATA || DEMO;

/*
 * "GROUPS ARE NOT BUILT" WAS TRUE AND IS NOT ANY MORE, which is why the sentence
 * changed on 2026-09-02. Groups now exist: they are created, joined, asked to
 * join, and talked in, against `public.groups` — what these four cards are is
 * placeholders that were never on any server, and that is the narrower and still
 * true claim. Leaving the old wording would have told a reviewer the whole
 * feature was unbuilt while a real one sat under the same pills.
 */
export const GROUPS_DEMO_NOTICE =
  "Placeholder groups, shown to review this layout. None of these four is real and nobody has joined one — the names, member counts and post counts were written by ICEFALL and none of it happened. Real groups, when there are any, appear below them.";

/**
 * Guarded BUILDER, not a top-level literal — and the `import.meta.env` reads are
 * spelled out inline on purpose.
 *
 * The build-time substitution has to be syntactically inside the branch for the
 * branch to fold. Routing it through `SHOW_DEMO_GROUPS` reads better and puts
 * every invented group back into the production bundle, because the bundler can
 * no longer prove the branch is dead. The same trap is documented in
 * `social/community.ts` and `guides/types.ts`. Do not tidy this.
 */
function buildDemoGroups(): DemoGroup[] {
  if (!import.meta.env.DEV && import.meta.env.VITE_SHOW_DEMO !== "1") return [];
  return [
    {
      id: "g-mont-blanc",
      name: "Mont Blanc Objectives",
      mountain: "Mont Blanc",
      cover: "/img/mont-blanc.jpg",
      members: 1240,
      posts: 156,
      private: true,
      joined: false,
    },
    {
      id: "g-alpine-women",
      name: "Alpine Women",
      mountain: "Alps",
      cover: "/img/alpine-team.jpg",
      members: 843,
      posts: 98,
      private: false,
      joined: false,
    },
    {
      id: "g-ama-dablam",
      name: "Ama Dablam Climbers",
      mountain: "Ama Dablam",
      cover: "/img/ama-dablam.jpg",
      members: 612,
      posts: 73,
      private: false,
      joined: false,
    },
    {
      id: "g-denali-2026",
      name: "Denali Push 2026",
      mountain: "Denali",
      cover: "/img/denali.jpg",
      members: 489,
      posts: 64,
      private: true,
      joined: false,
    },
  ];
}

export const DEMO_GROUPS: readonly DemoGroup[] = buildDemoGroups();
