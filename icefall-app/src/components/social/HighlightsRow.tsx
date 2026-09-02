import { useEffect, useState, type JSX } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Plus } from "lucide-react";
import { Avatar } from "@/components/ui/primitives";
import { supabase } from "@/backend/client";
import { cn } from "@/lib/utils";

/**
 * HIGHLIGHTS — the row of circles on a profile.
 *
 * A story ends after a day. A highlight is a story its author decided to keep:
 * `highlights` (a name, a cover, an order) plus `highlight_items` (which stories
 * are in it), from `20260902170000_story_highlights.sql`. Membership is also
 * what makes an expired story publicly readable again — the migration amends
 * `posts_select` to say so — so this row needs no special access and asks for
 * none.
 *
 * ── WHY THERE IS NO AZURE RING HERE ──────────────────────────────────────────
 *
 * `StoryRail` draws the azure gradient ring for exactly one thing: this device
 * has not watched that person's story yet. A highlight has no such state and
 * never can — it is permanent, there is nothing to be late for, and no story
 * leaves it by being seen. Reusing the ring would say "new, watch this now" on a
 * shelf that has looked the same for a month. So every tile here takes the quiet
 * `bg-hairline-strong` edge, which is the same treatment `StoryRail` falls back
 * to once a story HAS been watched. For the same reason nothing here is dimmed:
 * the `opacity-60` on that rail carries the seen state, and a highlight has none
 * to carry.
 *
 * ── THE NEW TILE, AND WHOSE PROFILE THIS IS ──────────────────────────────────
 *
 * On your own profile the first tile is always the + — it is the way in, and it
 * is present even when you have kept nothing, because an empty profile with no
 * control on it is a feature nobody can find. On somebody else's it is ABSENT
 * rather than disabled: `highlight_items_insert` requires the highlight and the
 * post to both be yours, so a + on a stranger's shelf would be an affordance the
 * database will always refuse.
 *
 * ── WHAT IS NOT DRAWN ────────────────────────────────────────────────────────
 *
 * On somebody else's profile, an empty or unanswered read renders NOTHING — no
 * empty row, no placeholder circles, no "0 highlights". That cuts both ways and
 * is worth being straight about: a failed read looks the same as a person who
 * has kept nothing. The alternative is a failure notice on every profile you
 * scroll past when the signal goes, which is noise on a screen that is not about
 * this row. Nothing claims nothing; a placeholder would claim something.
 */

/**
 * The typed client does not know about `highlights` — `backend/types.ts`
 * predates the social migrations and belongs to another session. Same untyped
 * view `Composer.tsx` and `Comments.tsx` opened for the same reason; the row
 * shapes below are checked against the migration by hand.
 */
const untyped = supabase as unknown as SupabaseClient | null;

/**
 * `post-media`, created by `20260902160000_post_media_bucket.sql`. PRIVATE, so a
 * cover has to be signed rather than linked — a public bucket serves an object
 * to anyone holding the URL for ever, including a photo its author later
 * deleted, which is precisely why that migration made it private.
 *
 * `Composer.tsx` holds the WRITE half of this and still has its bucket at null,
 * so no personal post has media yet and `signCovers` below will find nothing to
 * sign for a while. That is the correct amount of nothing: the tile falls back
 * to its monogram, which is a real answer, rather than to a broken frame.
 */
const POST_MEDIA_BUCKET = "post-media";

/** Long enough to scroll a profile and reopen it; short enough not to be a link. */
const COVER_URL_TTL_SECONDS = 60 * 60;

/**
 * The embed hint is NOT optional, and this is the trap.
 *
 * `highlights` reaches `posts` twice: directly through `cover_post_id`, and as a
 * many-to-many through `highlight_items` — whose primary key is exactly the two
 * foreign keys, which is the junction shape PostgREST recognises on sight. A
 * bare `posts(...)` is therefore ambiguous and comes back as a 300 with a list
 * of the relationships it could have meant, not as a cover. Naming the
 * constraint picks the direct one.
 *
 * `items` is fetched as rows rather than as a `count` aggregate because
 * aggregate embeds depend on a PostgREST setting this app does not control, and
 * a project with them switched off fails the WHOLE select rather than dropping
 * the field. The rows are a handful of uuids; the count is taken from them here.
 */
const SELECT =
  "id, name, " +
  "cover:posts!highlights_cover_post_id_fkey(media_path, media_meta), " +
  "items:highlight_items(post_id)";

interface CoverRow {
  media_path: string | null;
  media_meta: unknown;
}

interface HighlightRow {
  id: string;
  name: string;
  /** PostgREST serves a to-one embed as an object; some shapes hand back a one-element array. */
  cover: CoverRow | CoverRow[] | null;
  items: { post_id: string }[] | null;
}

interface Highlight {
  id: string;
  name: string;
  /** The cover story's media path, before signing. Absent = no cover was set. */
  coverPath?: string;
  /** A signed, displayable URL — only ever set once storage actually returned one. */
  coverUrl?: string;
  /** Counted from the item rows. Never stored: the schema has no count column. */
  items: number;
}

type Rail =
  | { status: "loading" }
  | { status: "no-backend" }
  | { status: "signed-out" }
  /** The read itself failed. NOT the same thing as "nothing has been kept". */
  | { status: "unreadable" }
  | { status: "ready"; highlights: Highlight[] };

/**
 * A cover is one of the highlight's own stories, so there is no second image to
 * resolve — but there is a second thing to check.
 *
 * VIDEO COVERS FALL BACK TO THE MONOGRAM. This component does not decode media
 * (`Composer.tsx` says the same about itself when it refuses to describe a file
 * it has not read), so it cannot pull a frame out of a reel, and an `<img>`
 * pointed at an mp4 renders an empty black circle. A monogram is the honest
 * picture of "there is something here we cannot show you as a still".
 *
 * `cover` can also come back null for a cover post that is in no highlight —
 * `posts_select` only re-opens a story that is IN one — in which case the tile
 * takes its monogram too.
 */
function toHighlight(row: HighlightRow): Highlight {
  const cover = Array.isArray(row.cover) ? row.cover[0] : row.cover;
  const meta = (cover?.media_meta ?? null) as { kind?: unknown } | null;
  const isImage = meta?.kind === "image";
  return {
    id: row.id,
    name: row.name,
    coverPath: cover?.media_path && isImage ? cover.media_path : undefined,
    items: row.items?.length ?? 0,
  };
}

/**
 * Signs every cover in one request rather than one per tile.
 *
 * Failure is not an error state for this row: an unsigned cover becomes a
 * monogram and the shelf still reads correctly, so nothing here throws and
 * nothing here reports. The one rule is that a URL is only ever attached when
 * storage actually handed one back — a path is not a picture.
 */
async function signCovers(highlights: Highlight[]): Promise<Highlight[]> {
  const paths = [...new Set(highlights.map((h) => h.coverPath).filter((p): p is string => !!p))];
  if (paths.length === 0 || !untyped) return highlights;

  const { data } = await untyped.storage
    .from(POST_MEDIA_BUCKET)
    .createSignedUrls(paths, COVER_URL_TTL_SECONDS);

  const signed = new Map<string, string>();
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl && !entry.error) signed.set(entry.path, entry.signedUrl);
  }
  if (signed.size === 0) return highlights;

  return highlights.map((h) => ({
    ...h,
    coverUrl: h.coverPath ? signed.get(h.coverPath) : undefined,
  }));
}

function useHighlights(profileId: string | undefined, isOwn: boolean): Rail {
  const [rail, setRail] = useState<Rail>({ status: "loading" });

  useEffect(() => {
    let alive = true;

    async function load() {
      /* Not our profile and nobody named — there is no id to ask about, so the
         honest answer is an empty shelf rather than a guess at whose it is.
         Checked before the session so a stranger's profile never costs a call. */
      if (!isOwn && !profileId) {
        if (alive) setRail({ status: "ready", highlights: [] });
        return;
      }

      if (!supabase || !untyped) {
        if (alive) setRail({ status: "no-backend" });
        return;
      }

      /* `highlights_select` is granted to `authenticated` only, and the table is
         revoked from `anon` by name — so a signed-out reader does not get an
         empty list, they get a permission error. Asking without a session would
         turn "you are not signed in" into "this person has kept nothing". */
      const { data: sess } = await supabase.auth.getSession();
      if (!alive) return;
      if (!sess.session) {
        setRail({ status: "signed-out" });
        return;
      }

      const owner = profileId ?? sess.session.user.id;

      // Ordered the way the index is: the owner's arrangement first, and the
      // creation time only to break a tie, so two highlights sharing a position
      // do not swap places between two loads of the same profile.
      const { data, error } = await untyped
        .from("highlights")
        .select(SELECT)
        .eq("owner_id", owner)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });

      if (!alive) return;
      if (error) {
        setRail({ status: "unreadable" });
        return;
      }

      const highlights = ((data ?? []) as unknown as HighlightRow[]).map(toHighlight);
      const withCovers = await signCovers(highlights);
      if (!alive) return;
      setRail({ status: "ready", highlights: withCovers });
    }

    setRail({ status: "loading" });
    void load();

    // INITIAL_SESSION and TOKEN_REFRESHED are skipped for the reason
    // `useMyProfile` documents: the first repeats the load directly above, and
    // the second means the token changed, not the person.
    const sub = supabase?.auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
      void load();
    });
    return () => {
      alive = false;
      sub?.data.subscription.unsubscribe();
    };
  }, [profileId, isOwn]);

  return rail;
}

/* -------------------------------------------------------------------------- */
/* The row                                                                    */
/* -------------------------------------------------------------------------- */

export function HighlightsRow({
  profileId,
  isOwn,
  onOpen,
  onCreate,
  className,
}: {
  /** Whose profile this is. Absent on your own profile means "the signed-in id". */
  profileId?: string;
  isOwn: boolean;
  onOpen(highlightId: string): void;
  /** Optional so the row can be mounted before a create flow is wired up. */
  onCreate?(): void;
  className?: string;
}): JSX.Element | null {
  const rail = useHighlights(profileId, isOwn);

  /*
   * SOMEBODY ELSE'S PROFILE: a row only appears when there is genuinely
   * something on the shelf. See the header — no empty rail, and no notice for a
   * read that did not come back, because neither belongs on a screen that is
   * about the person rather than about ICEFALL's connection.
   */
  if (!isOwn) {
    if (rail.status !== "ready" || rail.highlights.length === 0) return null;
    return (
      /* Same wrapper/scroller nesting as the own-profile branch below, so a
         caller's `className` lands on the same element whichever branch renders
         — a border passed in must not sit inside the scroller on one profile
         and outside it on the next. */
      <div className={className}>
        <div className="no-scrollbar overflow-x-auto">
          <ul className="flex w-max gap-4 px-5 py-3">
            {rail.highlights.map((h) => (
              <HighlightTile key={h.id} highlight={h} onOpen={onOpen} />
            ))}
          </ul>
        </div>
      </div>
    );
  }

  /*
   * YOUR OWN PROFILE. The + is disabled rather than hidden when a highlight
   * cannot be made — the tile is the explanation's anchor, and `StoryRail`
   * disables its "Your story" tile the same way when no composer is wired.
   * A failed READ is not evidence a WRITE would fail, so `unreadable` leaves it
   * enabled and says its piece underneath. `loading` leaves it enabled too: the
   * answer arrives in a moment either way, and a + that greys itself out every
   * time a profile opens reads as broken rather than as careful.
   */
  const blocked = rail.status === "no-backend" || rail.status === "signed-out";
  const note =
    rail.status === "signed-out"
      ? "A highlight is kept on your account, so making one needs you signed in."
      : rail.status === "no-backend"
        ? "Highlights are kept on the server, and this build is not talking to one — so there is nowhere yet to keep a story past its day."
        : rail.status === "unreadable"
          ? "Your highlights could not be loaded. That is a read that did not come back rather than an empty shelf — anything you have kept is still there."
          : null;

  return (
    <div className={className}>
      <div className="no-scrollbar overflow-x-auto">
        <ul className="flex w-max gap-4 px-5 py-3">
          <li>
            <button
              type="button"
              onClick={onCreate}
              disabled={!onCreate || blocked}
              aria-label="Create a highlight"
              className="flex w-[68px] flex-col items-center gap-1.5 rounded-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60 focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian disabled:opacity-60"
            >
              <span className="grid h-[62px] w-[62px] place-items-center rounded-full border border-dashed border-hairline-strong text-mist">
                <Plus size={20} strokeWidth={1.7} />
              </span>
              <span className="w-full truncate text-center text-[10.5px] text-snow">New</span>
            </button>
          </li>

          {rail.status === "ready" &&
            rail.highlights.map((h) => (
              <HighlightTile key={h.id} highlight={h} onOpen={onOpen} />
            ))}
        </ul>
      </div>

      {note && <p className="px-5 pb-3 text-[11.5px] leading-relaxed text-mist-dim">{note}</p>}
    </div>
  );
}

/**
 * One circle.
 *
 * The count in the label is COUNTED, from the item rows this row already read —
 * there is no count column on `highlights` and none is implied here. A highlight
 * with nothing in it says so rather than borrowing a figure; it can exist, on
 * your own profile, between naming it and filling it.
 */
function HighlightTile({
  highlight,
  onOpen,
}: {
  highlight: Highlight;
  onOpen(highlightId: string): void;
}) {
  const kept =
    highlight.items === 0
      ? "nothing kept in it yet"
      : highlight.items === 1
        ? "1 story"
        : `${highlight.items} stories`;

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(highlight.id)}
        aria-label={`${highlight.name} — ${kept}`}
        className="flex w-[68px] flex-col items-center gap-1.5 rounded-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60 focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian"
      >
        <span className="grid h-[62px] w-[62px] place-items-center rounded-full bg-hairline-strong p-[2px]">
          <span className="grid h-full w-full place-items-center rounded-full bg-obsidian p-[2px]">
            {highlight.coverUrl ? (
              <img
                src={highlight.coverUrl}
                alt=""
                aria-hidden
                loading="lazy"
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              /* The highlight's own initials, never a stock photograph — the
                 same rule `StoryRail` follows for a person with no picture, and
                 the reason `Avatar` exists. An unset cover is a real state: the
                 migration nulls it when the cover story goes rather than taking
                 the highlight with it. */
              <Avatar name={highlight.name} size={52} />
            )}
          </span>
        </span>
        <span className="w-full truncate text-center text-[10.5px] text-snow">
          {highlight.name}
        </span>
      </button>
    </li>
  );
}
