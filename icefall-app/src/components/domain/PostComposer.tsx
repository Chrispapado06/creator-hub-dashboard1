import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Camera, ChevronRight, Flag, Image as ImageIcon, MessageCircle,
  Mountain as MountainIcon, Route as RouteIcon, Share2, Trash2, Type, X, Zap,
} from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { sharePage } from "@/components/ui/primitives";
import { readBanner } from "@/lib/image";
import { fmtDate, fmtDistance, fmtElevation, fmtHours } from "@/lib/format";
import { searchCatalogueByName, type Peak } from "@/services/peaks";
import { savedTrails, type SavedTrail } from "@/services/savedTrails";
import { useRecordedActivities } from "@/tracking/feed";
import { activityById } from "@/tracking/activities";
import type { RecordedActivity } from "@/tracking/types";
import { useApp } from "@/state/AppState";
import {
  MAX_POST_PHOTOS, OWN_POST_KIND_LABEL, PRIVACY_LABEL, addPost, removePost,
  type MountainRef, type OwnPost, type OwnPostKind, type PostPrivacy,
} from "@/social/posts";
import { cn } from "@/lib/utils";

/**
 * Creating a post, and reading one back.
 *
 * The composer is deliberately not a publishing tool: pick what kind of thing
 * you are sharing, say it, optionally pin it to a mountain, choose who it is
 * for, post. Attachments are REFERENCES — the activity card reads its metrics
 * live from the recording, so nothing here can drift from what was measured.
 */

/* -------------------------------------------------------------------------- */
/* Compose                                                                     */
/* -------------------------------------------------------------------------- */

const KIND_OPTIONS: { kind: OwnPostKind; label: string; detail: string; icon: typeof Type }[] = [
  { kind: "photo", label: "Photo", detail: "A picture from the hill", icon: ImageIcon },
  { kind: "text", label: "Text", detail: "Just say it", icon: Type },
  { kind: "activity", label: "Activity", detail: "Attach a recorded session", icon: Zap },
  { kind: "route", label: "Route", detail: "Attach a saved trail", icon: RouteIcon },
  { kind: "objective", label: "Objective", detail: "What you are preparing for", icon: Flag },
];

export function CreatePostSheet({
  onClose,
  presetMountain,
}: {
  onClose: () => void;
  presetMountain?: MountainRef;
}) {
  const { goals } = useApp();
  const recorded = useRecordedActivities();
  const [kind, setKind] = useState<OwnPostKind | null>(null);
  const [caption, setCaption] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [mountain, setMountain] = useState<MountainRef | undefined>(presetMountain);
  const [activityId, setActivityId] = useState<string | undefined>();
  const [routeOsmId, setRouteOsmId] = useState<number | undefined>();
  const [objective, setObjective] = useState<{ name: string; when: string } | undefined>();
  const [privacy, setPrivacy] = useState<PostPrivacy>("public");
  const fileInput = useRef<HTMLInputElement | null>(null);

  const trails = savedTrails();
  const realActivities = recorded.filter((r) => !r.simulated);

  const canPost =
    kind !== null &&
    (caption.trim().length > 0 ||
      photos.length > 0 ||
      activityId !== undefined ||
      routeOsmId !== undefined ||
      objective !== undefined);

  /* ---- Step 1: what kind of post -------------------------------------- */
  if (kind === null) {
    return (
      <Sheet title="Create post" onClose={onClose}>
        <div className="space-y-2 px-1 pb-2">
          {KIND_OPTIONS.map((o) => {
            const disabled =
              (o.kind === "activity" && realActivities.length === 0) ||
              (o.kind === "route" && trails.length === 0) ||
              (o.kind === "objective" && goals.filter((g) => g.status === "active").length === 0);
            return (
              <button
                key={o.kind}
                type="button"
                disabled={disabled}
                onClick={() => {
                  setKind(o.kind);
                  if (o.kind === "objective") {
                    const g = goals.find((x) => x.status === "active");
                    if (g) setObjective({ name: g.name, when: fmtDate(g.targetDate, { day: undefined }) });
                  }
                }}
                className={cn(
                  "flex w-full items-center gap-3.5 rounded-tile border border-hairline bg-elevated/40 px-4 py-3.5 text-left transition-colors",
                  disabled ? "opacity-45" : "hover:border-azure/45",
                )}
              >
                <o.icon size={17} strokeWidth={1.6} className="shrink-0 text-azure" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] text-snow">{o.label}</span>
                  <span className="mt-0.5 block text-[11.5px] text-mist-dim">
                    {disabled
                      ? o.kind === "activity"
                        ? "No real recordings yet"
                        : o.kind === "route"
                          ? "No saved trails yet"
                          : "No active objective"
                      : o.detail}
                  </span>
                </span>
                <ChevronRight size={15} strokeWidth={1.8} className="shrink-0 text-mist-dim" />
              </button>
            );
          })}
          <p className="pt-1 text-[10.5px] leading-relaxed text-mist-dim">
            To log a summit, use "I've made it to a summit" — it carries the route and conditions
            fields a summit deserves. Video isn't supported yet: posts live on this device, and a
            video would fill its storage in one go.
          </p>
        </div>
      </Sheet>
    );
  }

  /* ---- Step 2: the post ------------------------------------------------ */
  const field =
    "mt-1.5 w-full rounded-tile border border-hairline bg-elevated/40 px-3.5 py-3 text-[14px] text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50";

  return (
    <Sheet title={`Create post · ${OWN_POST_KIND_LABEL[kind]}`} onClose={onClose}>
      <div className="space-y-4 px-1 pb-2">
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Add a caption…"
          rows={3}
          autoFocus
          className={cn(field, "resize-none leading-relaxed")}
        />

        {/* ---- Photos --------------------------------------------------- */}
        {(kind === "photo" || photos.length > 0) && (
          <div className="space-y-2">
            {photos.map((p, i) => (
              <div key={i} className="relative overflow-hidden rounded-tile border border-hairline">
                <img src={p} alt="" aria-hidden className="h-[110px] w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))}
                  aria-label="Remove photo"
                  className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-obsidian/75 text-snow"
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </div>
            ))}
            {photos.length < MAX_POST_PHOTOS && (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-tile border border-hairline-strong py-3 text-[12.5px] text-mist transition-colors hover:border-azure/45 hover:text-snow"
              >
                <Camera size={15} strokeWidth={1.7} />
                {photos.length === 0 ? "Add a photo" : `Add another (${MAX_POST_PHOTOS} max)`}
              </button>
            )}
            {photoError && <p className="text-[11.5px] text-danger">{photoError}</p>}
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setPhotoError(null);
            try {
              const url = await readBanner(file);
              setPhotos((ps) => [...ps, url].slice(0, MAX_POST_PHOTOS));
            } catch (err) {
              setPhotoError((err as { message?: string })?.message ?? "That image couldn't be read.");
            }
          }}
        />

        {/* ---- Add to post ---------------------------------------------- */}
        <div>
          <p className="text-[11px] uppercase tracking-[0.1em] text-mist-dim">Add to post</p>
          <div className="mt-2 space-y-2">
            <MountainPicker value={mountain} onChange={setMountain} />

            {kind === "activity" && (
              <ActivityPicker
                activities={realActivities}
                value={activityId}
                onChange={setActivityId}
              />
            )}

            {kind === "route" && (
              <div className="space-y-1.5">
                {trails.slice(0, 5).map((t) => (
                  <PickRow
                    key={t.osmId}
                    active={routeOsmId === t.osmId}
                    title={t.name}
                    detail={t.lengthKm ? `${t.lengthKm} km` : "Saved trail"}
                    onClick={() => setRouteOsmId(routeOsmId === t.osmId ? undefined : t.osmId)}
                  />
                ))}
              </div>
            )}

            {kind === "objective" && objective && (
              <div className="rounded-tile border border-azure/35 bg-azure/[0.06] px-3.5 py-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-azure/85">Objective</p>
                <p className="mt-1 text-[14px] text-snow">
                  {objective.name} · {objective.when}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ---- Privacy --------------------------------------------------- */}
        <div>
          <p className="text-[11px] uppercase tracking-[0.1em] text-mist-dim">Privacy</p>
          <div className="mt-2 flex gap-2">
            {(Object.keys(PRIVACY_LABEL) as PostPrivacy[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPrivacy(p)}
                className={cn(
                  "flex-1 rounded-pill border px-3 py-2 text-[12px] transition-colors",
                  privacy === p
                    ? "border-azure/55 bg-azure/[0.1] text-azure"
                    : "border-hairline-strong text-mist hover:text-snow",
                )}
              >
                {PRIVACY_LABEL[p]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-mist-dim">
            Decides who sees it once accounts exist. Today every post stays on this device.
          </p>
        </div>

        <button
          type="button"
          disabled={!canPost}
          onClick={() => {
            addPost({ kind, caption: caption.trim(), photos, mountain, activityId, routeOsmId, objective, privacy });
            onClose();
          }}
          className="w-full rounded-card bg-azure py-3.5 text-[13.5px] uppercase tracking-[0.1em] text-obsidian transition-colors hover:bg-azure-bright disabled:opacity-40"
        >
          Post
        </button>
      </div>
    </Sheet>
  );
}

/* ---- Small pickers ------------------------------------------------------- */

function PickRow({
  active,
  title,
  detail,
  onClick,
}: {
  active: boolean;
  title: string;
  detail?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-tile border px-3.5 py-2.5 text-left transition-colors",
        active ? "border-azure/55 bg-azure/[0.08]" : "border-hairline bg-elevated/40 hover:border-hairline-strong",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-snow">{title}</span>
        {detail && <span className="block text-[11px] text-mist-dim">{detail}</span>}
      </span>
      {active && <span className="text-[12px] text-azure">✓</span>}
    </button>
  );
}

function ActivityPicker({
  activities,
  value,
  onChange,
}: {
  activities: RecordedActivity[];
  value?: string;
  onChange: (id?: string) => void;
}) {
  if (activities.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {activities.slice(0, 5).map((a) => (
        <PickRow
          key={a.id}
          active={value === a.id}
          title={a.title}
          detail={`${fmtDistance(a.distanceM / 1000, 1)} km · +${fmtElevation(a.elevationGainM)} m · ${fmtDate(a.startedAt, { day: "numeric" })}`}
          onClick={() => onChange(value === a.id ? undefined : a.id)}
        />
      ))}
    </div>
  );
}

/** Search the peak catalogue; free text stands when no catalogue entry matches. */
function MountainPicker({
  value,
  onChange,
}: {
  value?: MountainRef;
  onChange: (m?: MountainRef) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Peak[]>([]);

  useEffect(() => {
    let live = true;
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    searchCatalogueByName(query, 4).then((r) => {
      if (live) setHits(r);
    });
    return () => {
      live = false;
    };
  }, [query]);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-tile border border-azure/40 bg-azure/[0.06] px-3.5 py-3">
        <MountainIcon size={15} strokeWidth={1.7} className="shrink-0 text-azure" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] text-snow">{value.name}</span>
          {value.elevationM && (
            <span className="tnum block text-[11px] text-mist-dim">
              {fmtElevation(value.elevationM)} m
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => onChange(undefined)}
          aria-label="Remove mountain"
          className="shrink-0 p-1 text-mist-dim hover:text-snow"
        >
          <X size={14} strokeWidth={1.8} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Attach a mountain…"
        className="w-full rounded-tile border border-hairline bg-elevated/40 px-3.5 py-3 text-[13.5px] text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50"
      />
      {(hits.length > 0 || query.trim().length >= 2) && (
        <div className="mt-1.5 space-y-1.5">
          {hits.map((p) => (
            <PickRow
              key={p.id}
              active={false}
              title={p.name}
              detail={`${fmtElevation(p.elevationM)} m`}
              onClick={() => onChange({ name: p.name, peakId: p.id, elevationM: p.elevationM })}
            />
          ))}
          {query.trim().length >= 2 && (
            <PickRow
              active={false}
              title={`Use “${query.trim()}”`}
              detail="Not in the catalogue — attached by name"
              onClick={() => onChange({ name: query.trim() })}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The card                                                                    */
/* -------------------------------------------------------------------------- */

export function OwnPostCard({
  post,
  author,
  recorded,
}: {
  post: OwnPost;
  author: { name: string; region?: string; avatar?: string };
  /** All recordings, so an attached activity renders its real metrics. */
  recorded: RecordedActivity[];
}) {
  const activity = post.activityId ? recorded.find((r) => r.id === post.activityId) : undefined;

  return (
    <article className="overflow-hidden rounded-card border border-hairline bg-graphite">
      {/* ---- Byline ------------------------------------------------------- */}
      <div className="flex items-center gap-3 px-4 pt-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-slate text-[13px] text-mist">
          {author.avatar ? (
            <img src={author.avatar} alt="" aria-hidden className="h-full w-full object-cover" />
          ) : (
            author.name.slice(0, 1).toUpperCase()
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] text-snow">{author.name}</span>
          <span className="tnum block text-[11px] text-mist-dim">
            {fmtDate(post.createdAt, { day: "numeric" })}
            {author.region ? ` · Around ${author.region.split(",")[0]}` : ""}
          </span>
        </span>
        <span className="shrink-0 rounded-pill border border-hairline-strong px-2 py-[3px] text-[9px] uppercase tracking-[0.12em] text-mist">
          {OWN_POST_KIND_LABEL[post.kind]}
        </span>
        <button
          type="button"
          onClick={() => removePost(post.id)}
          aria-label="Delete this post"
          className="shrink-0 p-1 text-mist-dim transition-colors hover:text-danger"
        >
          <Trash2 size={14} strokeWidth={1.7} />
        </button>
      </div>

      {post.photos.length > 0 && (
        <div className={cn("mt-3.5 grid gap-px", post.photos.length > 1 && "grid-cols-2")}>
          {post.photos.map((p, i) => (
            <img key={i} src={p} alt="" aria-hidden className="h-[170px] w-full object-cover" />
          ))}
        </div>
      )}

      <div className="p-4">
        {post.caption && (
          <p className="text-[13.5px] leading-relaxed text-snow">{post.caption}</p>
        )}

        {/* ---- Mountain — a clickable entity, straight to its page -------- */}
        {post.mountain && (
          <MountainChip mountain={post.mountain} className={post.caption ? "mt-3" : ""} />
        )}

        {/* ---- Activity metrics: read live from the recording ------------- */}
        {activity && (
          <div className="mt-3 rounded-tile border border-hairline bg-slate/40 p-3">
            <p className="text-[12.5px] text-snow">{activity.title}</p>
            <p className="mt-0.5 text-[10.5px] uppercase tracking-[0.1em] text-mist-dim">
              {activityById(activity.activityTypeId).label}
            </p>
            <div className="tnum mt-2 flex gap-4 text-[12px] text-mist">
              <span>{fmtDistance(activity.distanceM / 1000, 1)} km</span>
              <span>+{fmtElevation(activity.elevationGainM)} m</span>
              <span>{fmtHours(activity.movingSec / 3600)}</span>
            </div>
            <Link
              to={`/activity/${activity.id}`}
              className="mt-2 inline-block text-[11.5px] text-azure underline-offset-2 hover:underline"
            >
              View activity →
            </Link>
          </div>
        )}

        {post.routeOsmId && (
          <Link
            to={`/explore/trail/${post.routeOsmId}`}
            className="mt-3 flex items-center gap-2 text-[12px] text-azure underline-offset-2 hover:underline"
          >
            <RouteIcon size={13} strokeWidth={1.8} />
            View route
          </Link>
        )}

        {post.objective && (
          <div className="mt-3 rounded-tile border border-azure/30 bg-azure/[0.05] px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-azure/85">Objective</p>
            <p className="mt-1 text-[13px] text-snow">
              {post.objective.name} · {post.objective.when}
            </p>
          </div>
        )}

        {/* ---- Footer: only controls that do something -------------------- */}
        <div className="mt-3.5 flex items-center gap-4 border-t border-hairline pt-3">
          <Link
            to={`/social/post/${post.id}`}
            className="flex items-center gap-1.5 text-[12px] text-mist transition-colors hover:text-snow"
          >
            <MessageCircle size={14} strokeWidth={1.7} />
            Comment
          </Link>
          <button
            type="button"
            onClick={() => sharePage(`${author.name} on ICEFALL`, window.location.origin)}
            className="flex items-center gap-1.5 text-[12px] text-mist transition-colors hover:text-snow"
          >
            <Share2 size={14} strokeWidth={1.7} />
            Share
          </button>
          <span className="flex-1" />
          <span className="text-[10px] uppercase tracking-[0.1em] text-mist-dim">
            {PRIVACY_LABEL[post.privacy]}
          </span>
        </div>
      </div>
    </article>
  );
}

export function MountainChip({
  mountain,
  className,
}: {
  mountain: MountainRef;
  className?: string;
}) {
  const inner = (
    <>
      <MountainIcon size={14} strokeWidth={1.7} className="shrink-0 text-azure" />
      <span className="min-w-0 flex-1 truncate text-[13px] text-snow">{mountain.name}</span>
      {mountain.elevationM && (
        <span className="tnum shrink-0 text-[11.5px] text-mist-dim">
          {fmtElevation(mountain.elevationM)} m
        </span>
      )}
      {mountain.peakId && (
        <ChevronRight size={14} strokeWidth={1.8} className="shrink-0 text-mist-dim" />
      )}
    </>
  );
  const cls = cn(
    "flex w-full items-center gap-2.5 rounded-tile border border-hairline bg-slate/40 px-3 py-2.5",
    mountain.peakId && "transition-colors hover:border-azure/40",
    className,
  );
  return mountain.peakId ? (
    <Link to={`/explore/peak/${encodeURIComponent(mountain.peakId)}`} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
