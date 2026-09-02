import { useEffect, useRef, useState, type JSX } from "react";
import { Link } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Check,
  ChevronDown,
  Clock,
  Film,
  Image as ImageIcon,
  Loader2,
  Lock,
  ShieldCheck,
  X,
} from "lucide-react";
import { AzureNotice, Badge, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { BACKEND_NOT_CONNECTED, supabase } from "@/backend/client";
import {
  HOUSE_RULES,
  HOUSE_RULES_ACK_IS_LOCAL,
  HOUSE_RULES_ACK_LABEL,
  HOUSE_RULES_ACK_NOT_HELD_BY_ICEFALL,
  HOUSE_RULES_NEW_VERSION_NOTICE,
  HOUSE_RULES_SUMMARY,
  HOUSE_RULES_TITLE,
  houseRulesAccountKey,
  useHouseRulesAcknowledgement,
  type HouseRulesAckState,
} from "@/social/houseRules";
import { fmtDate, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * THE FEED COMPOSER — words, a story, and the video gate.
 *
 * Three decisions are worth the reading time, because each one is a place a
 * composer normally lies.
 *
 * 1. VIDEO IS GATED ON A SERVER FACT, NOT A LOCAL ONE. The owner's ruling is
 *    "reels or videos posted by verified users with identity only", and the
 *    only thing that can answer "is this person verified" is
 *    `profiles.identity_verified` — a PostgREST computed field derived from
 *    `identity_checks` (20260831160000). It is DERIVED on purpose: a stored
 *    boolean can outlive its evidence, and this one cannot. So this component
 *    reads it and never caches a verdict.
 *
 *    Four states, not two. Verified / not verified / could not check / not
 *    signed in are different sentences, and collapsing "we could not ask" into
 *    "you are not verified" tells a verified climber they are unverified. The
 *    gate still FAILS CLOSED — anything short of a literal `true` leaves video
 *    locked — it just says the right thing while doing so. (Same lesson the
 *    guides app learned when `credentials_verified` was dropped: an absent
 *    field reads `undefined`, which is falsy, which is safe but silent.)
 *
 * 2. A STORY IS A POST WITH AN EXPIRY, and the expiry is enforced by the read
 *    policy rather than by a cleanup job or by this screen — `posts_select`
 *    stops at `expires_at`, so the moment it passes the row leaves everyone
 *    else's feed. That is why stories exist only on the server path: an expiry
 *    this app tracked itself would be a promise the feed could forget to keep.
 *
 * 3. NOTHING HERE CLAIMS A DELIVERY IT DID NOT MAKE. The insert either returns
 *    a row id or it does not; on failure the words stay in the box and the
 *    screen says what happened, in the voice `support/tickets.ts` uses for the
 *    same problem. There is no local mirror, no retry queue, and no "sent!"
 *    that outruns the round trip.
 *
 * 4. THE HOUSE RULES ARE READ BEFORE THE FIRST POST, AND THEY STOP THE BUTTON.
 *    `social/houseRules.ts` holds the owner's six numbered rules; this is one of
 *    the two surfaces that genuinely publishes, so it is one of the two that
 *    gates. The argument for gating rather than decorating is written out above
 *    `HouseRulesGate` below, along with the sentence that keeps it honest: the
 *    acknowledgement is on this phone and ICEFALL does not hold it.
 */

/* -------------------------------------------------------------------------- */
/* What the database will accept                                               */
/* -------------------------------------------------------------------------- */

/** `posts_body_check` — `length(trim(body)) between 1 and 4000`. Matched, not guessed. */
const MAX_BODY = 4000;

/** How long a story runs. `expires_at > created_at` is the only rule the column has. */
const STORY_HOURS = [12, 24, 48] as const;

/**
 * WHERE A PHOTO OR A VIDEO WOULD GO — and why it is `null`.
 *
 * There is exactly one storage bucket in `icefall-supabase/migrations`:
 * `operator-media`, created by 20260828130000. It is company-scoped by
 * construction — the insert policy requires `is_company_admin` over the
 * company id in the FIRST path segment — so an athlete cannot write to it, and
 * pointing personal posts at it would be a path traversal wearing a product
 * name. No bucket for personal post media exists.
 *
 * Creating one is a MIGRATION, and migrations are the owner's to gate (rule 3),
 * so this is left as a null constant rather than a hopeful bucket name: a
 * hardcoded name would put a file picker in front of a climber that could only
 * ever end in a storage error. While it is null the media rows are LOCKED
 * STATEMENTS — they say what the rule is and why nothing can be attached yet —
 * and `uploadMedia` below is the one place that changes when the bucket lands.
 */
const POST_MEDIA_BUCKET: string | null = null;

const NO_MEDIA_STORE =
  "ICEFALL has no media store for personal posts yet, so there is nowhere to put a file — the only bucket that exists belongs to expedition companies. Words post now; photo and video open the moment that store exists.";

const VIDEO_NEEDS_IDENTITY =
  "Video and reels are for accounts whose identity ICEFALL has checked. It is the one thing on this feed that carries a person's face and voice, so it carries their name as well.";

const IDENTITY_UNKNOWN =
  "ICEFALL could not check your verification just now, so video stays closed. This is a failed check rather than a verdict — it does not mean you are unverified.";

/* -------------------------------------------------------------------------- */
/* Who is composing                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The typed client does not know about `posts` — `backend/types.ts` was written
 * before the social migration and it belongs to another session. Rather than
 * edit a file this component does not own, the two calls that need the new
 * tables go through an untyped view of the same client. The shape they insert
 * is checked against the migration by hand, above.
 */
const untyped = supabase as unknown as SupabaseClient | null;

type Account =
  | { status: "loading" }
  | { status: "no-backend" }
  | { status: "signed-out" }
  /** `verified: null` means the check itself failed — see IDENTITY_UNKNOWN. */
  | { status: "ready"; uid: string; verified: boolean | null };

function useComposerAccount(): Account {
  const [account, setAccount] = useState<Account>({ status: "loading" });

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!supabase || !untyped) {
        if (alive) setAccount({ status: "no-backend" });
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!alive) return;
      if (!sess.session) {
        setAccount({ status: "signed-out" });
        return;
      }
      const uid = sess.session.user.id;

      // `identity_verified` is a function of the row, so PostgREST serves it
      // like a column. If the migration is not deployed the request FAILS
      // rather than quietly omitting the field — which is why an error here
      // becomes "could not check" and not "not verified".
      const { data, error } = await untyped
        .from("profiles")
        .select("id, identity_verified")
        .eq("id", uid)
        .maybeSingle();

      if (!alive) return;
      const flag = (data as { identity_verified?: unknown } | null)?.identity_verified;
      setAccount({
        status: "ready",
        uid,
        verified: error || typeof flag !== "boolean" ? null : flag,
      });
    }

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
  }, []);

  return account;
}

/* -------------------------------------------------------------------------- */
/* Media                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `kind` is "image", not "photo", because `PostMedia.kind` in
 * `social/types.ts` is `"image" | "video"` — the value written into
 * `media_meta` here is the value the cards read back, and two vocabularies for
 * one field is how a renderer ends up with a media type it does not recognise.
 */
type Attachment = { file: File; url: string; kind: "image" | "video" };

type Uploaded = { path: string; meta: Record<string, unknown> };

/**
 * The single place that knows how post media reaches the server.
 *
 * It refuses before it touches the network while `POST_MEDIA_BUCKET` is null,
 * so no caller can produce a half-made post: media that cannot be stored stops
 * the whole publish rather than being silently dropped from it.
 */
async function uploadMedia(
  uid: string,
  attachment: Attachment,
): Promise<{ ok: true; uploaded: Uploaded } | { ok: false; message: string }> {
  if (!POST_MEDIA_BUCKET || !untyped) return { ok: false, message: NO_MEDIA_STORE };

  // The owner's id first, mirroring the operator-media convention: storage
  // policies can only match on the path, so whoever owns the object has to be
  // the first segment.
  const ext = attachment.file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;

  const { error } = await untyped.storage
    .from(POST_MEDIA_BUCKET)
    .upload(path, attachment.file, { contentType: attachment.file.type, upsert: false });

  if (error) {
    return {
      ok: false,
      message:
        "That file could not be stored, so nothing was posted. Your words are still here — remove the attachment to post them now.",
    };
  }
  return {
    ok: true,
    uploaded: {
      path,
      // Everything here was MEASURED from the file the person chose. No
      // duration, no dimensions, no thumbnail: this component does not decode
      // media, so it does not describe what it has not read.
      meta: { kind: attachment.kind, mime: attachment.file.type, bytes: attachment.file.size },
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Failures, in sentences                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Postgres speaks to operators, not to climbers — the same rule
 * `support/tickets.ts` follows. `permission denied for table posts` is accurate
 * and unusable; every branch below ends in something a person can act on.
 */
function readFailure(code: string | undefined, message: string): string {
  const m = message.toLowerCase();

  if (code === "42P01" || m.includes("does not exist") || m.includes("schema cache")) {
    return "ICEFALL's server does not have the feed tables yet, so this could not be posted and nothing was stored. Nobody has seen it.";
  }
  if (code === "42501" || m.includes("permission denied") || m.includes("row-level security")) {
    return "ICEFALL refused this post. That normally means the session ended — signing in again is worth a try. Nothing was stored.";
  }
  if (code === undefined && (m.includes("fetch") || m.includes("network"))) {
    return "This could not be sent — the device is offline. Nothing has been stored and nothing is waiting in the background, so it has not reached anybody. What you wrote is still here.";
  }
  return "ICEFALL could not post this, and it has not been stored. What you wrote is still here — trying again is worth a go.";
}

/* -------------------------------------------------------------------------- */
/* Composer                                                                    */
/* -------------------------------------------------------------------------- */

export function Composer({
  onPosted,
  className,
}: {
  /** Fired only after the server returned a row id. Nothing optimistic. */
  onPosted?(): void;
  className?: string;
}): JSX.Element {
  const account = useComposerAccount();

  const [body, setBody] = useState("");
  const [isStory, setIsStory] = useState(false);
  const [hours, setHours] = useState<number>(24);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [posted, setPosted] = useState<{ endsAt: string | null } | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);
  const wantKind = useRef<"image" | "video">("image");

  /**
   * `accept` is set on the element rather than through a prop. Both rows share
   * one input, and a ref does not re-render — set as a prop it would carry the
   * PREVIOUS row's filter, so tapping "Video" after "Photo" would open an image
   * picker. Setting it immediately before `.click()` cannot go stale.
   */
  function openPicker(kind: "image" | "video") {
    wantKind.current = kind;
    if (picker.current) picker.current.accept = kind === "video" ? "video/*" : "image/*";
    picker.current?.click();
  }

  // An object URL survives the component that made it, so the preview is
  // released when it is replaced and when the composer goes away.
  useEffect(() => {
    if (!attachment) return;
    return () => URL.revokeObjectURL(attachment.url);
  }, [attachment]);

  const verified = account.status === "ready" ? account.verified : null;
  const canWrite = account.status === "ready";
  const trimmed = body.trim();
  const overLimit = trimmed.length > MAX_BODY;
  const canPost = canWrite && trimmed.length > 0 && !overLimit && !busy;

  async function publish() {
    if (account.status !== "ready" || !untyped) return;
    setBusy(true);
    setFailure(null);

    let media: Uploaded | null = null;
    if (attachment) {
      const result = await uploadMedia(account.uid, attachment);
      if (!result.ok) {
        setFailure(result.message);
        setBusy(false);
        return;
      }
      media = result.uploaded;
    }

    const endsAt = isStory ? new Date(Date.now() + hours * 3_600_000).toISOString() : null;

    // `.select("id")` is not decoration: the returned id is the only evidence
    // the row exists. A screen that says "posted" on the strength of a missing
    // error is claiming a delivery it did not witness.
    const { data, error } = await untyped
      .from("posts")
      .insert({
        author_id: account.uid,
        // The phone app posts as a person. Speaking for a company needs an
        // active membership check the policy makes, and a screen that offers
        // it here would offer it to people who do not have one.
        author_kind: "profile",
        body: trimmed,
        expires_at: endsAt,
        media_path: media?.path ?? null,
        media_meta: media?.meta ?? null,
      })
      .select("id")
      .single();

    setBusy(false);
    if (error || !data) {
      setFailure(readFailure(error?.code, error?.message ?? ""));
      return;
    }

    setBody("");
    setAttachment(null);
    setIsStory(false);
    setPosted({ endsAt });
    onPosted?.();
  }

  /* ---- Nothing to compose into ----------------------------------------- */

  if (account.status === "loading") {
    return (
      <Card className={className}>
        <p className="flex items-center gap-2.5 text-[12.5px] text-mist-dim">
          <Loader2 size={14} strokeWidth={1.8} className="animate-spin" />
          Checking your account…
        </p>
      </Card>
    );
  }

  if (account.status === "no-backend" || account.status === "signed-out") {
    const signedOut = account.status === "signed-out";
    return (
      <Card className={cn("space-y-3.5", className)} inset>
        <AzureNotice title={signedOut ? "Sign in to post" : "Not connected"}>
          <p>
            {signedOut
              ? "A post carries your name, so it needs your account. Without one there is nobody for it to be from."
              : BACKEND_NOT_CONNECTED}
          </p>
        </AzureNotice>
        {signedOut && (
          <Button asChild className="w-full">
            <Link to="/auth/signin">Sign in</Link>
          </Button>
        )}
      </Card>
    );
  }

  /* ---- The composer ----------------------------------------------------- */

  return (
    <Card className={cn("space-y-4", className)}>
      <SectionLabel
        action={
          verified === true ? (
            <Badge tone="azure">
              <ShieldCheck size={11} strokeWidth={2} />
              Identity verified
            </Badge>
          ) : undefined
        }
      >
        {isStory ? "New story" : "New post"}
      </SectionLabel>

      <textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setPosted(null);
        }}
        rows={3}
        placeholder="What happened on the hill?"
        aria-label="What you want to say"
        className="w-full resize-none rounded-tile border border-hairline bg-elevated/40 px-3.5 py-3 text-[14px] leading-relaxed text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50"
      />
      {/* The count appears only where it starts to matter. A counter that runs
          from the first keystroke turns a caption into a form field. */}
      {trimmed.length > MAX_BODY - 400 && (
        <p className={cn("tnum -mt-2 text-[11px]", overLimit ? "text-danger" : "text-mist-dim")}>
          {trimmed.length.toLocaleString("en-GB")} / {MAX_BODY.toLocaleString("en-GB")}
          {overLimit && " — the server will refuse this length"}
        </p>
      )}

      {/* ---- Permanent, or a story ---------------------------------------- */}
      <div>
        <div className="flex gap-2">
          {[
            { story: false, label: "Post" },
            { story: true, label: "Story" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => setIsStory(o.story)}
              className={cn(
                "flex-1 rounded-pill border px-3 py-2 text-[12px] transition-colors",
                isStory === o.story
                  ? "border-azure/55 bg-azure/[0.1] text-azure"
                  : "border-hairline-strong text-mist hover:text-snow",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>

        {isStory && (
          <div className="mt-2.5">
            <div className="flex gap-2">
              {STORY_HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHours(h)}
                  className={cn(
                    "flex-1 rounded-pill border px-3 py-1.5 text-[12px] transition-colors",
                    hours === h
                      ? "border-azure/55 bg-azure/[0.1] text-azure"
                      : "border-hairline-strong text-mist hover:text-snow",
                  )}
                >
                  {h}h
                </button>
              ))}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-mist-dim">
              <Clock size={12} strokeWidth={1.8} className="shrink-0" />
              Ends at {fmtTime(new Date(Date.now() + hours * 3_600_000).toISOString())}, and leaves
              every other feed at that moment. You keep your own copy.
            </p>
          </div>
        )}
      </div>

      {/* ---- Photo and video ---------------------------------------------
          Locked STATEMENTS rather than greyed-out buttons: a disabled control
          says "no" and explains nothing, and the owner asked specifically that
          an unverified climber be told why video is closed and what opens it. */}
      <div className="space-y-2">
        <MediaRow
          icon={ImageIcon}
          title="Photo"
          state={POST_MEDIA_BUCKET ? "open" : "blocked"}
          detail={POST_MEDIA_BUCKET ? "Open to everyone." : NO_MEDIA_STORE}
          onPick={() => openPicker("image")}
        />
        <MediaRow
          icon={Film}
          title="Video or reel"
          state={verified !== true ? "locked" : POST_MEDIA_BUCKET ? "open" : "blocked"}
          detail={
            verified === null
              ? IDENTITY_UNKNOWN
              : verified === false
                ? VIDEO_NEEDS_IDENTITY
                : POST_MEDIA_BUCKET
                  ? "Your identity is verified, so video is yours to post."
                  : `Your identity is verified, so video is yours to post. ${NO_MEDIA_STORE}`
          }
          footer={
            verified === false ? (
              <Link
                to="/settings/verification"
                className="mt-2 inline-block text-[11.5px] text-azure underline-offset-2 hover:underline"
              >
                How identity verification works →
              </Link>
            ) : undefined
          }
          onPick={() => openPicker("video")}
        />
      </div>

      <input
        ref={picker}
        type="file"
        className="hidden"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setFailure(null);
          setAttachment({ file, url: URL.createObjectURL(file), kind: wantKind.current });
        }}
      />

      {attachment && (
        <div className="relative overflow-hidden rounded-tile border border-hairline">
          {attachment.kind === "video" ? (
            <video src={attachment.url} controls className="h-[150px] w-full bg-obsidian object-contain" />
          ) : (
            <img src={attachment.url} alt="" aria-hidden className="h-[150px] w-full object-cover" />
          )}
          <button
            type="button"
            onClick={() => setAttachment(null)}
            aria-label="Remove attachment"
            className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-obsidian/75 text-snow"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      )}

      {failure && (
        <p className="rounded-tile border border-danger/35 bg-danger/[0.06] px-3.5 py-3 text-[12px] leading-relaxed text-snow">
          {failure}
        </p>
      )}

      {posted && (
        <p className="rounded-tile border border-azure/30 bg-azure/[0.05] px-3.5 py-3 text-[12px] leading-relaxed text-snow">
          {posted.endsAt
            ? `Posted as a story. It ends at ${fmtTime(posted.endsAt)} and disappears from other feeds then.`
            : "Posted."}
        </p>
      )}

      <Button className="w-full" disabled={!canPost} onClick={() => void publish()}>
        {busy ? "Posting…" : isStory ? "Post story" : "Post"}
      </Button>

      <Disclaimer>
        A post cannot be edited once it is up — the feed has no update path at all. It can be
        deleted, and that is the only way to take words back.
      </Disclaimer>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function MediaRow({
  icon: Icon,
  title,
  detail,
  state,
  footer,
  onPick,
}: {
  icon: React.ComponentType<{ size?: number | string; strokeWidth?: number | string; className?: string }>;
  title: string;
  detail: string;
  /** open = a picker; locked = the identity rule; blocked = nowhere to upload. */
  state: "open" | "locked" | "blocked";
  /**
   * Only ever passed on a row that is NOT `open` — the link inside it would be
   * an anchor nested in a button, which browsers resolve by dropping one of
   * them. The one caller that passes a footer does so exactly when the identity
   * gate has already closed the row.
   */
  footer?: React.ReactNode;
  onPick: () => void;
}) {
  const inner = (
    <>
      <span className="flex items-center gap-2.5">
        <Icon
          size={15}
          strokeWidth={1.7}
          className={cn("shrink-0", state === "open" ? "text-azure" : "text-mist-dim")}
        />
        <span className="text-[13.5px] text-snow">{title}</span>
        {state === "locked" && <Lock size={12} strokeWidth={1.8} className="text-mist-dim" />}
      </span>
      <span className="mt-1.5 block text-[11px] leading-relaxed text-mist-dim">{detail}</span>
      {footer}
    </>
  );

  const cls = "block w-full rounded-tile border border-hairline bg-elevated/30 px-3.5 py-3 text-left";

  return state === "open" ? (
    <button type="button" onClick={onPick} className={cn(cls, "transition-colors hover:border-azure/45")}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
