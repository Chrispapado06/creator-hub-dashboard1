import { useEffect, useState, type JSX } from "react";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { Check } from "lucide-react";

import { Button, Disclaimer } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { supabase } from "@/backend/client";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  HIGHLIGHT_MAKES_IT_PUBLIC_AGAIN,
  MAX_HIGHLIGHT_NAME,
  useHighlightActions,
} from "@/social/highlights";

/**
 * MAKING A HIGHLIGHT — a name, then which of your own stories go in it.
 *
 * ── THE PICKER SHOWS ONLY YOUR OWN STORIES, AND NOT OUT OF POLITENESS ────────
 *
 * `highlight_items_insert` requires the post to be yours AND the highlight to
 * be yours (20260902170000). A picker offering anything else would be a control
 * that can only ever end in a refusal — the same reason `HighlightsRow` hides
 * the + on somebody else's profile rather than disabling it.
 *
 * ── WHY STILL-RUNNING STORIES ARE LISTED TOO ─────────────────────────────────
 *
 * A highlight is for a story that has ended, and most of these have. But the
 * policy asks only who owns the post, and the moment somebody most wants to
 * keep a story is the hour before it goes — so a picker that hid the live ones
 * would make a person wait a day for a control that would have worked. They are
 * listed and LABELLED, because "still running" and "ended in May" are different
 * things and the tile says which. What is NOT listed is an ordinary permanent
 * post: the schema would take one, but this is the screen for keeping a story
 * past its day, and offering the feed here would make the two indistinguishable.
 *
 * ── THE ORDER THINGS HAPPEN IN IS THE MIGRATION'S, NOT A PREFERENCE ──────────
 *
 * The highlight is created FIRST and filled after, because `highlights_write`
 * (as amended by 20260902210000) will only accept a new row whose cover is
 * null — a cover has to be a post the highlight already contains, and a brand
 * new highlight contains nothing. So a create that half-succeeds leaves a real,
 * named, empty highlight on the profile, and this screen says so rather than
 * reporting a failure for a row that exists.
 *
 * ── WHAT IS NEVER DRAWN ──────────────────────────────────────────────────────
 *
 * No placeholder grid, no example highlight, no count of anything ICEFALL did
 * not read. A person with no stories is told that in a sentence; a read that
 * did not come back says so and does not become "you have no stories".
 */

/**
 * `posts` is not in `backend/types.ts` — that file predates the social
 * migrations and belongs to another session, so it is imported from rather than
 * edited. Same untyped view `Composer.tsx`, `Comments.tsx` and `HighlightsRow`
 * opened for the same reason; the row shape below was checked against
 * `20260831190000` by hand.
 */
const untyped = supabase as unknown as SupabaseClient | null;

/** `post-media`, from 20260902160000. PRIVATE, so a path is not a picture. */
const POST_MEDIA_BUCKET = "post-media";
/** Long enough to fill in a name and choose; short enough not to be a link. */
const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * How far back the picker reaches in one request.
 *
 * Stories accumulate for ever — expiry is not a delete — so this genuinely
 * hides older ones rather than merely capping a page nobody would scroll. The
 * screen says so when the read comes back full, because a picker that silently
 * stops at a date is one where a story somebody is looking for is simply absent.
 */
const PICKER_LIMIT = 60;

const NO_BACKEND =
  "ICEFALL is not connected to a server in this build, so it cannot read your stories and has nowhere to keep a highlight.";

const SIGNED_OUT =
  "A highlight sits on your own profile and is made of your own stories, so this needs you signed in.";

const NOT_LIVE =
  "ICEFALL's server does not have stories yet, so there is nothing to choose from. This is a missing table rather than an empty history.";

const UNREACHABLE =
  "ICEFALL could not reach the server, so it does not know which stories you have posted. This is a failed request rather than an answer — try again when you have signal.";

const NONE_YET =
  "You have not posted a story yet, so there is nothing to keep. Post one from the feed, and it can go in a highlight while it is still running or long after it has ended.";

/**
 * The refusal nobody anticipated. It says the read did not come back and stops
 * there, because the alternative — reaching for the friendliest of the
 * sentences above — is this screen guessing at a cause it does not have. In
 * particular it must NOT default to UNREACHABLE: a server that answered with a
 * refusal was reached, and telling somebody to try again when they have signal
 * would send them looking for a problem that is not theirs.
 */
const READ_FAILED =
  "Your stories could not be read, so there is nothing here to choose from. This is a failed read rather than an empty history — nothing has been deleted.";

/* -------------------------------------------------------------------------- */
/* Your own stories                                                            */
/* -------------------------------------------------------------------------- */

interface OwnStory {
  id: string;
  /** `posts.body` — NOT NULL, so a tile always has words even with no picture. */
  body: string;
  createdAt: string;
  /** Set on every row here: the query asks only for posts that end. */
  expiresAt: string;
  /** Only ever set when storage really signed one. A path is not a picture. */
  thumbUrl?: string;
}

type Picker =
  | { status: "loading" }
  | { status: "blocked"; message: string }
  | { status: "ready"; stories: OwnStory[]; truncated: boolean };

/**
 * The same three-way reading of a refusal the rest of the social code makes:
 * a missing table or a missing grant is an absence, a transport failure is a
 * failure, and the two must not be collapsed into one sentence.
 */
function blockedBy(error: PostgrestError): string {
  /* 42501 is NOT a deployment fact — it is a refusal. Measured 2026-09-02: a
     deployed table with no grant for this role answers 42501, a missing one
     answers PGRST205. Telling somebody whose session expired that the feature
     is not live yet is a false claim about the server. See backend/pgErrors.ts. */
  if (error.code === "PGRST205" || error.code === "42P01")
    return NOT_LIVE;
  if ((error.message ?? "").toLowerCase().includes("fetch")) return UNREACHABLE;
  return READ_FAILED;
}

/**
 * Signs every thumbnail in one request rather than one per tile.
 *
 * Fails soft on purpose: an unsigned path comes back absent and the tile shows
 * the story's own words, which is a real answer. An `<img>` pointed at an
 * unsigned storage path is a broken frame where type would have been fine.
 */
async function signThumbs(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0 || !untyped) return out;

  const { data, error } = await untyped.storage
    .from(POST_MEDIA_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error || !Array.isArray(data)) return out;

  for (const entry of data) {
    // Each entry carries its own error — one unsignable object must not be read
    // as a URL for the others.
    if (!entry || entry.error || typeof entry.path !== "string") continue;
    if (typeof entry.signedUrl === "string" && entry.signedUrl.length > 0) {
      out.set(entry.path, entry.signedUrl);
    }
  }
  return out;
}

/**
 * Your own stories, newest first.
 *
 * `posts_select` admits `author_id = auth.uid()` before it looks at expiry —
 * your own history is yours — so this returns the ended ones as well as the
 * running ones without needing anything the highlight tables provide.
 *
 * The untyped client hands back `any`, so every field is re-checked rather than
 * trusted, and a row missing an id, a body or a date is DROPPED rather than
 * coerced into a blank tile. A coerced value is an invented one.
 */
function useOwnStories(): Picker {
  const [picker, setPicker] = useState<Picker>({ status: "loading" });

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!supabase || !untyped) {
        if (alive) setPicker({ status: "blocked", message: NO_BACKEND });
        return;
      }

      const { data: sess } = await supabase.auth.getSession();
      if (!alive) return;
      const uid = sess.session?.user.id;
      if (!uid) {
        setPicker({ status: "blocked", message: SIGNED_OUT });
        return;
      }

      const { data, error } = await untyped
        .from("posts")
        .select("id, body, media_path, media_meta, created_at, expires_at")
        .eq("author_id", uid)
        // A story is a post with an expiry. This is the whole definition — there
        // is no kind column and no flag to read instead.
        .not("expires_at", "is", null)
        .order("created_at", { ascending: false })
        .limit(PICKER_LIMIT);

      if (!alive) return;
      if (error) {
        setPicker({ status: "blocked", message: blockedBy(error) });
        return;
      }

      // Double cast: supabase-js parses the select string at the type level and
      // an untyped client cannot resolve it, so it falls back to a shape that is
      // not comparable in one step. The honest admission that these rows are
      // unchecked — which is why each field is checked below.
      const rows = Array.isArray(data) ? (data as unknown as Record<string, unknown>[]) : [];

      const stories: OwnStory[] = [];
      const paths: string[] = [];
      const pathFor = new Map<string, string>();

      for (const row of rows) {
        const id = typeof row.id === "string" ? row.id : null;
        const body = typeof row.body === "string" ? row.body : null;
        const createdAt = typeof row.created_at === "string" ? row.created_at : null;
        const expiresAt = typeof row.expires_at === "string" ? row.expires_at : null;
        if (!id || !body || !createdAt || !expiresAt) continue;

        const meta = (row.media_meta ?? null) as { kind?: unknown } | null;
        const path =
          typeof row.media_path === "string" && row.media_path.length > 0 ? row.media_path : null;
        // VIDEO TILES FALL BACK TO THEIR WORDS. This screen does not decode
        // media, so it cannot pull a frame out of a clip, and an `<img>` at an
        // mp4 is an empty black square. The same rule `HighlightsRow` follows
        // for a cover.
        if (path && meta?.kind === "image") {
          paths.push(path);
          pathFor.set(id, path);
        }

        stories.push({ id, body, createdAt, expiresAt });
      }

      const signed = await signThumbs(paths);
      if (!alive) return;

      setPicker({
        status: "ready",
        stories: stories.map((s) => {
          const path = pathFor.get(s.id);
          return { ...s, thumbUrl: path ? signed.get(path) : undefined };
        }),
        truncated: rows.length >= PICKER_LIMIT,
      });
    }

    void load();
    return () => {
      alive = false;
    };
  }, []);

  return picker;
}

/* -------------------------------------------------------------------------- */
/* The sheet                                                                   */
/* -------------------------------------------------------------------------- */

export function CreateHighlight({
  onDone,
  onCancel,
}: {
  /** The new highlight's id, or null when nothing was created. */
  onDone(id: string | null): void;
  onCancel(): void;
}): JSX.Element {
  const picker = useOwnStories();
  const { create, addPost, error: writeError, busy } = useHighlightActions();

  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  /**
   * Set only once the server has handed back an id. From this point the
   * highlight EXISTS, so every way out of this sheet has to report it — closing
   * on `onCancel(null)` here would leave a real highlight on the profile that
   * the caller believes was never made.
   */
  const [created, setCreated] = useState<string | null>(null);
  const [missed, setMissed] = useState(0);

  const trimmed = name.trim();
  const stories = picker.status === "ready" ? picker.stories : [];
  const canSave =
    trimmed.length > 0 && trimmed.length <= MAX_HIGHLIGHT_NAME && selected.length > 0 && !busy;

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function save() {
    const id = created ?? (await create(trimmed));
    // `create` returns the id the server sent back rather than the absence of an
    // error, so a null here is a highlight that does not exist. `writeError`
    // already carries why, in a sentence somebody can act on.
    if (!id) return;
    setCreated(id);

    /*
     * OLDEST FIRST, AND SEQUENTIALLY. `highlight_items.position` defaults to 0
     * for everything, so the run plays in the order the rows were inserted —
     * chronological is the order the trip happened in, which is the order an
     * Everest reads in. Sequential rather than parallel because the first add
     * also claims the cover, and concurrent adds would make the cover whichever
     * request happened to land first: the person would get an arbitrary picture
     * on their circle instead of where the trip started.
     */
    const ordered = stories.filter((s) => selected.includes(s.id)).reverse();

    let failed = 0;
    for (const story of ordered) {
      const ok = await addPost(id, story.id);
      if (!ok) failed += 1;
    }

    if (failed > 0) {
      setMissed(failed);
      return;
    }
    onDone(id);
  }

  /* ---- Created, but not everything went in ------------------------------ */

  if (created && missed > 0) {
    return (
      <Sheet title="Highlight created" onClose={() => onDone(created)}>
        <div className="space-y-4 py-4">
          <p className="text-[13px] leading-relaxed text-snow">
            “{trimmed}” is on your profile.{" "}
            {missed === 1
              ? "One of the stories you chose did not go in."
              : `${missed} of the stories you chose did not go in.`}{" "}
            Nothing was half-saved — open the highlight and add them again.
          </p>
          {writeError && (
            <p className="text-[11.5px] leading-relaxed text-mist-dim">{writeError}</p>
          )}
          <Button className="w-full" onClick={() => onDone(created)}>
            Done
          </Button>
        </div>
      </Sheet>
    );
  }

  /* ---- The form --------------------------------------------------------- */

  return (
    <Sheet title="New highlight" onClose={created ? () => onDone(created) : onCancel}>
      <div className="space-y-5 py-4">
        <div>
          <label htmlFor="highlight-name" className="section-label block">
            Name
          </label>
          <input
            id="highlight-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            // Matched to `length(trim(name)) between 1 and 40` rather than
            // guessed at, so the box refuses what the column would refuse.
            maxLength={MAX_HIGHLIGHT_NAME}
            placeholder="Everest"
            autoComplete="off"
            className="mt-2 w-full rounded-tile border border-hairline bg-elevated/40 px-3.5 py-3 text-[13.5px] text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50"
          />
          {name.length > 0 && (
            <p className="tnum mt-1.5 text-right text-[10.5px] text-mist-dim">
              {trimmed.length}/{MAX_HIGHLIGHT_NAME}
            </p>
          )}
        </div>

        {/* Said BEFORE the highlight is made, not after. Keeping a story undoes
            the one thing the 24 hours promised, and the person doing it is
            entitled to know that at the moment they decide. */}
        <Disclaimer>{HIGHLIGHT_MAKES_IT_PUBLIC_AGAIN}</Disclaimer>

        <div>
          <span className="section-label block">
            {selected.length > 0 ? `Your stories · ${selected.length} chosen` : "Your stories"}
          </span>

          {picker.status === "loading" && (
            <p className="mt-2 text-[11.5px] leading-relaxed text-mist-dim">
              Reading your stories…
            </p>
          )}

          {picker.status === "blocked" && (
            <p className="mt-2 text-[11.5px] leading-relaxed text-mist-dim">{picker.message}</p>
          )}

          {/* A sentence, never an empty grid: a row of blank squares reads as a
              screen that failed rather than as a person who has posted nothing. */}
          {picker.status === "ready" && picker.stories.length === 0 && (
            <p className="mt-2 text-[11.5px] leading-relaxed text-mist-dim">{NONE_YET}</p>
          )}

          {picker.status === "ready" && picker.stories.length > 0 && (
            <>
              <ul className="mt-3 grid grid-cols-3 gap-2">
                {picker.stories.map((story) => (
                  <StoryTile
                    key={story.id}
                    story={story}
                    selected={selected.includes(story.id)}
                    onToggle={() => toggle(story.id)}
                  />
                ))}
              </ul>
              {picker.truncated && (
                <p className="mt-2 text-[10.5px] leading-relaxed text-mist-dim">
                  Your {PICKER_LIMIT} most recent stories. Older ones are not listed here yet — they
                  still exist and nothing has been deleted.
                </p>
              )}
            </>
          )}
        </div>

        {writeError && <p className="text-[11.5px] leading-relaxed text-mist-dim">{writeError}</p>}

        <Button className="w-full" disabled={!canSave} onClick={() => void save()}>
          {busy ? "Keeping…" : "Create highlight"}
        </Button>

        {/* Why the button is off, when it is off for a reason the person can
            fix. An unexplained disabled control is a screen refusing to say
            what it wants. */}
        {!canSave && !busy && picker.status === "ready" && picker.stories.length > 0 && (
          <p className="text-[11px] leading-relaxed text-mist-dim">
            {trimmed.length === 0
              ? "Give it a name — “Everest”, or whatever the stories in it are."
              : "Choose at least one story. A highlight can be created empty, but an empty circle on a profile shows nothing to anyone who taps it."}
          </p>
        )}
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* One story to choose                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The tile carries the row and nothing else: the words, the day it was posted,
 * and whether its 24 hours have run out — computed from `expires_at` against
 * the clock at render, never stored, because a stored "ended" outlives the
 * moment it describes.
 */
function StoryTile({
  story,
  selected,
  onToggle,
}: {
  story: OwnStory;
  selected: boolean;
  onToggle(): void;
}) {
  const ended = new Date(story.expiresAt).getTime() <= Date.now();

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        aria-label={`${fmtDate(story.createdAt)} — ${ended ? "ended" : "still running"}`}
        className={cn(
          "relative aspect-[3/4] w-full overflow-hidden rounded-tile border text-left transition-colors",
          selected ? "border-azure/55" : "border-hairline hover:border-hairline-strong",
        )}
      >
        {story.thumbUrl ? (
          <>
            <img
              src={story.thumbUrl}
              alt=""
              aria-hidden
              loading="lazy"
              draggable={false}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-obsidian/85 to-transparent" />
          </>
        ) : (
          /* No photograph, and none is borrowed. The story's own words are what
             it was, so they are what identifies it here. */
          <span className="block h-full w-full bg-elevated/40 px-2 py-2">
            <span className="line-clamp-4 text-[10.5px] leading-relaxed text-mist">
              {story.body}
            </span>
          </span>
        )}

        <span className="absolute inset-x-0 bottom-0 px-2 pb-1.5">
          <span className="tnum block text-[9.5px] text-snow">{fmtDate(story.createdAt)}</span>
          <span className="block text-[9px] text-mist-dim">
            {ended ? "ended" : "still running"}
          </span>
        </span>

        {selected && (
          <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-azure text-obsidian">
            <Check size={12} strokeWidth={2.4} />
          </span>
        )}
      </button>
    </li>
  );
}
