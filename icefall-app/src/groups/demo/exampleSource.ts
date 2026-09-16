/**
 * Labelled example groups for demo builds (structure plan §3.3, D9, Q12).
 *
 * This is the only demo mechanism for Groups. Decisions it holds:
 *
 * - GATED AT DEFINITION. A build with neither `VITE_ICEFALL_OFFLINE=1` nor
 *   `VITE_ICEFALL_DEMO=1` (the `DEMO` flag in `offline/offline.ts`) gets an empty
 *   list, and the literals fold out of the bundle. The env reads are written
 *   inline inside the builder on purpose: routed through a shared constant, the
 *   bundler cannot prove the branch dead and ships the literals anyway (see
 *   "HOW TO USE IT, AND THE TRAP" in `lib/demoFlag.ts`). Do not tidy this.
 * - EVERY RECORD SAYS "Example" IN ITS OWN TEXT: each group name, member name,
 *   post and message. Each group sits on a real mountain from the app catalogue,
 *   and nothing uses a name, figure or text from the owner's mockups (redesign
 *   plan §7). Dates are left unset rather than invented.
 * - READ THROUGH THE REAL SEAMS. `social/groupSpace.ts` answers group, roster and
 *   message reads for an example id from here, and `social/groupPosts.ts` reads
 *   the feed through `exampleFeedSource`, so an example is drawn by the same
 *   code as a real group.
 * - EVERY WRITE IS REFUSED with `EXAMPLE_READ_ONLY` and changes nothing.
 *   Nothing here is ever written to `icefall.state.v1` or any other store.
 * - PURE. No React, no storage and no network, so it runs under the node tests.
 *   Only types are imported from the social modules, so there is no import cycle.
 */
import { MOUNTAINS } from "@/data/mock/mountains";
import type { FeedError, GroupFeedSource } from "@/social/groupPosts";
import type {
  GroupMember,
  GroupMembership,
  GroupMessage,
  GroupMountain,
  GroupSpace,
  GroupVisibility,
} from "@/social/groupSpace";

/** The word every example record carries. */
export const EXAMPLE_LABEL = "Example";

/** What every write on an example answers. */
export const EXAMPLE_READ_ONLY = "Examples can't be changed.";

/** Said once on an example group's page. */
export const EXAMPLE_GROUP_NOTE = "An example for review, so nothing in it is real.";

/** An example post, as the `posts` row the real feed reader takes. */
export interface ExamplePostRow {
  id: string;
  author_id: string;
  author_kind: "profile";
  body: string;
  media_path: null;
  media_meta: null;
  created_at: string;
  expires_at: null;
  group_id: string;
  author: {
    id: string;
    display_name: string;
    username: null;
    avatar_url: null;
    location_label: null;
  };
  group: { id: string; name: string };
}

export interface ExampleGroup {
  group: GroupSpace;
  /** Where the reader stands. Decides which members-only doors open. */
  membership: GroupMembership;
  members: GroupMember[];
  messages: GroupMessage[];
  posts: ExamplePostRow[];
}

interface ExampleSpec {
  id: string;
  destinationId: string;
  visibility: GroupVisibility;
  membership: GroupMembership;
  memberLetters: string[];
  posts: string[];
  messages: string[];
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function mountainFor(destinationId: string): GroupMountain | null {
  const m = MOUNTAINS.find((x) => x.id === destinationId);
  if (!m) return null;
  return {
    id: m.id,
    name: m.name,
    range: m.range ?? null,
    country: m.country ?? null,
    elevationM: Number.isFinite(m.elevationM) ? m.elevationM : null,
  };
}

function exampleGroup(spec: ExampleSpec, now: number): ExampleGroup | null {
  const mountain = mountainFor(spec.destinationId);
  if (!mountain) return null;
  const at = (msAgo: number) => new Date(now - msAgo).toISOString();
  const name = `${EXAMPLE_LABEL} group · ${mountain.name}`;

  const members: GroupMember[] = spec.memberLetters.map((letter, i) => ({
    profileId: `example-member-${spec.destinationId}-${letter.toLowerCase()}`,
    name: `${EXAMPLE_LABEL} member ${letter}`,
    username: null,
    avatarUrl: null,
    joinedAt: at((30 - i * 5) * DAY),
    location: null,
    isOrganiser: i === 0,
  }));
  const author = (i: number) => members[i % members.length];

  const group: GroupSpace = {
    id: spec.id,
    name,
    destinationId: mountain.id,
    destination: { ...mountain, kind: "mountain" },
    mountain,
    visibility: spec.visibility,
    intendedOn: null,
    createdAt: at(30 * DAY),
    createdBy: members[0]?.profileId ?? null,
    memberCount: members.length,
    joinedByMe: spec.membership === "member",
    foundedByMe: false,
    // The first example member is marked as the organiser above, so this is
    // what the server would answer for this group.
    hasOrganiser: true,

    /* THE TRIP FIELDS ARE LEFT UNSET, every one of them. An example exists to
       show a real screen with labelled contents, and a capacity, a language or
       a route invented for one would be exactly the plausible detail the demo
       rules forbid. A null renders as nothing, which is the truth here. */
    kind: "team",
    about: "mountain",
    topic: null,
    official: false,
    endsOn: null,
    capacity: null,
    experience: null,
    routeLabel: null,
    language: null,
    description: null,
    coverPath: null,
    coverCredit: null,
  };

  const posts: ExamplePostRow[] = spec.posts.map((body, i) => {
    const person = author(i);
    return {
      id: `${spec.id}-post-${i + 1}`,
      author_id: person.profileId,
      author_kind: "profile",
      body,
      media_path: null,
      media_meta: null,
      created_at: at((2 + i * 3) * DAY),
      expires_at: null,
      group_id: spec.id,
      author: {
        id: person.profileId,
        display_name: person.name ?? EXAMPLE_LABEL,
        username: null,
        avatar_url: null,
        location_label: null,
      },
      group: { id: spec.id, name },
    };
  });

  const messages: GroupMessage[] = spec.messages.map((body, i) => ({
    id: `${spec.id}-message-${i + 1}`,
    groupId: spec.id,
    author: {
      profileId: author(i).profileId,
      name: author(i).name,
      username: null,
      avatarUrl: null,
    },
    body,
    mediaUnavailable: false,
    // Oldest first, as the real read returns them.
    createdAt: at((spec.messages.length - i) * HOUR),
    mine: false,
  }));

  return { group, membership: spec.membership, members, messages, posts };
}

/**
 * The examples, or nothing. See the header: the env reads stay inline.
 */
function buildExampleGroups(now: number): ExampleGroup[] {
  if (
    import.meta.env.VITE_ICEFALL_OFFLINE !== "1" &&
    import.meta.env.VITE_ICEFALL_DEMO !== "1"
  ) {
    return [];
  }
  const specs: ExampleSpec[] = [
    {
      id: "example-group-mont-blanc",
      destinationId: "mont-blanc",
      visibility: "public",
      membership: "member",
      memberLetters: ["A", "B", "C"],
      posts: [
        "Example post: members share plans, conditions and questions with the group here.",
        "Example post: only the group's members can read what is posted here.",
      ],
      messages: [
        "Example message: chat is for quick back-and-forth between members.",
        "Example message: each line shows who sent it and when.",
        "Example message: nothing in this example can be changed.",
      ],
    },
    {
      id: "example-group-matterhorn",
      destinationId: "matterhorn",
      visibility: "private",
      membership: "none",
      memberLetters: ["D", "E"],
      posts: ["Example post: only members of this private group can read it."],
      messages: ["Example message: only members of this private group can read it."],
    },
  ];
  return specs.flatMap((spec) => exampleGroup(spec, now) ?? []);
}

export const EXAMPLE_GROUPS: readonly ExampleGroup[] = buildExampleGroups(Date.now());

/** The example with this id, or null. Always null in a build without examples. */
export function exampleGroupById(groupId: string | undefined): ExampleGroup | null {
  if (!groupId) return null;
  return EXAMPLE_GROUPS.find((e) => e.group.id === groupId) ?? null;
}

export function isExampleGroupId(groupId: string | undefined): boolean {
  return exampleGroupById(groupId) !== null;
}

/** The sentence a write on this group answers, or null when it is not an example. */
export function exampleRefusal(groupId: string | undefined): string | null {
  return isExampleGroupId(groupId) ? EXAMPLE_READ_ONLY : null;
}

/**
 * The feed seam for examples. Reads answer from the example rows; the insert
 * writes nothing and answers `EXAMPLE_READ_ONLY`. `postToGroup` refuses an
 * example before it gets this far, so the insert is a second guard.
 */
export function exampleFeedSource(): GroupFeedSource {
  const refused: FeedError = { code: "example-read-only", message: EXAMPLE_READ_ONLY };
  return {
    uid: "",
    async membership(groupId) {
      const ex = exampleGroupById(groupId);
      if (!ex) return { found: false, joined: false, error: null };
      return { found: true, joined: ex.membership === "member", error: null };
    },
    async page(groupId, limit) {
      const ex = exampleGroupById(groupId);
      const rows = ex ? ex.posts.slice(0, limit) : [];
      return {
        rows: rows.map((r) => ({ ...r, author: { ...r.author }, group: { ...r.group } })),
        count: ex ? ex.posts.length : null,
        error: null,
      };
    },
    async sign() {
      return new Map<string, string>();
    },
    async insert() {
      return { id: null, error: refused };
    },
  };
}
