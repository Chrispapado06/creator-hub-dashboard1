// Tiny presentational helper for creator dropdowns.
//
// Used in the platform pages (Instagram / TikTok / Facebook / X) where
// admins pick which creator to view. Shows a small avatar next to the
// name so identification is one glance, not a read.
//
// Falls back to a tinted initials chip when no avatar_url is set on
// the creator row, which is the common case for newly-added creators.

type CreatorLike = {
  name: string;
  avatar_url?: string | null;
};

export function CreatorAvatarOption({ creator }: { creator: CreatorLike }) {
  const initials = creator.name
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      {creator.avatar_url ? (
        <img
          src={creator.avatar_url}
          alt=""
          className="h-5 w-5 rounded-full object-cover border border-border shrink-0"
          // If the URL is broken we hide the img and let the parent's
          // initials fallback show. Browsers leave a broken-image icon
          // otherwise — looks worse than a clean initials chip.
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <span className="h-5 w-5 rounded-full bg-gradient-to-br from-primary/30 to-primary-glow/30 border border-border flex items-center justify-center text-[9px] font-semibold shrink-0">
          {initials || "?"}
        </span>
      )}
      <span className="truncate">{creator.name}</span>
    </span>
  );
}
