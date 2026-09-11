/**
 * THE PROFILE COMES BACK — on a new phone, in a cleared browser, after a
 * reinstall — AND AN UNSENT EDIT SURVIVES IT.
 *
 * ── WHAT THIS IS FOR ─────────────────────────────────────────────────────────
 *
 * `settings/sync.ts` sends a profile edit and now also fetches the row back
 * (`fetchMyProfile`). This module is the only thing that decides what to DO with
 * an answer that disagrees with the phone — which is a decision with somebody's
 * unsent work on the other side of it, so it is written down once, here, rather
 * than made twice slightly differently by two screens.
 *
 * ── THE MERGE, IN FULL — ONE RULE, THE SAME FOR EVERY FIELD ─────────────────
 *
 * For every field, in this order — and a key ABSENT from `ServerProfile` was
 * never answered at all, so it falls to rule 3 with the rest:
 *
 *   1. IF THE DEVICE IS HOLDING IT UNSENT, THE DEVICE WINS AND IT STAYS
 *      QUEUED. Nothing here writes to the outbox, so the edit is still queued
 *      afterwards and still goes out on the next flush.
 *
 *      "UNSENT" IS TWO RECORDS, NOT ONE, AND THE SECOND ONE WAS MISSING AT
 *      FIRST. `pendingProfileEdit()` holds what was SENT AND FAILED. It says
 *      nothing about text that has been typed and not sent at all — the edit
 *      screen patches the phone on every keystroke and sends when the box is
 *      left, so between those two moments the new words are in the store and in
 *      neither the outbox nor the server. Reload in that window — a PWA killed
 *      in the background, a refresh, a swipe-away — and rule 2 would replace
 *      them with the server's older value, with nothing anywhere to restore
 *      them from. So the edit screen marks a field the moment somebody types
 *      into it (`noteUnsentField`) and clears the mark the moment a send has
 *      been attempted, and rule 1 honours BOTH records.
 *
 *   2. OTHERWISE, IF THE SERVER HOLDS A VALUE, THE SERVER WINS — whether or not
 *      the device holds one too.
 *
 *   3. OTHERWISE — THE SERVER'S COLUMN IS EMPTY — THE DEVICE KEEPS WHAT IT HAS.
 *      A FETCH FILLS AND CORRECTS; IT NEVER EMPTIES.
 *
 * One rule, in the same three lines, for every field: no per-field cleverness,
 * no newest-wins on a timestamp, no longest-wins.
 *
 * RULE 2 IS SAFE BECAUSE OF WHAT THE SERVER'S VALUE IS. Either this phone sent
 * it, in which case the server's copy is the same thing trimmed, lowercased,
 * de-duplicated or sorted — the form other climbers actually see, which
 * `sync.ts` already tells screens to prefer — or another device sent it, in
 * which case it is this athlete's more recent word on the subject and the whole
 * point of fetching.
 *
 * RULE 3 IS THE ONE THAT NEEDS DEFENDING, AND THE REASON IS EXACT: A DEVICE CAN
 * PROVE THAT A VALUE IS UNSENT AND CAN NEVER PROVE THAT ONE WAS SENT. The
 * outbox records what failed to go; it records nothing about a photograph
 * chosen on a build that had no write path at all — which is every build of
 * this app before `sync.ts`, and the phone in the owner's pocket. Under a plain
 * "server wins" that photograph is deleted, silently, on the next app open,
 * with nothing anywhere to restore it from. So an empty column is not allowed
 * to destroy something: it fills nothing and takes nothing away.
 *
 * WHAT RULE 3 COSTS, STATED RATHER THAN GLOSSED: clearing a field on one phone
 * does not clear it on another phone that already holds it. The second phone
 * keeps showing that bio to its owner — and to nobody else, since the server's
 * column is empty and the server is what everybody else reads — until it is
 * edited there. It is a stale value on one screen against a value that cannot
 * be recovered, and it is the right way round.
 *
 * RULE 3 CANNOT SHOW ONE PERSON ANOTHER PERSON'S LEFTOVERS, which would be the
 * obvious way for it to be wrong. A change of account clears these fields
 * outright before any of this runs — see below — so what rule 3 keeps is only
 * ever the signed-in athlete's own.
 *
 * THE ONE GUARD ON TOP OF THE RULE: a field whose device value CHANGED WHILE
 * THE REQUEST WAS IN FLIGHT is left alone. Somebody typing into the edit screen
 * during a cold start has not queued anything yet — the screen sends on blur —
 * so rule 2 would otherwise take the box out from under their fingers. The
 * before-and-after comparison costs nothing and closes it.
 *
 * THE GUARD IS ONLY WORTH ANYTHING IF THE "AFTER" IS ACTUALLY THE LAST MOMENT
 * BEFORE THE WRITE. The first draft snapshotted it once and then awaited a
 * SECOND request — the interests vocabulary, up to six seconds — before
 * applying anything, so everything typed during those six seconds passed the
 * comparison and was overwritten, and the athlete's face waited on a lookup it
 * had nothing to do with. So the patch lands in two parts: the pictures and the
 * text the moment the row arrives, and the interests afterwards with a
 * comparison of their own.
 *
 * ── WHEN THE ACCOUNT CHANGES, WHICH IS THE DANGEROUS DAY ────────────────────
 *
 * `AppState.signOut` deliberately keeps everything on the device, and
 * `settings/store.ts` is not scoped to an account at all: on a shared phone the
 * second person to sign in meets the first person's photograph, bio, region and
 * links, and the first person's queued edit is still in the outbox waiting to be
 * flushed onto whoever saves next. Both were true before this module existed;
 * neither is visible to the people it happens to.
 *
 * So the account is remembered (`profileOwner`, in `sync.ts` because the outbox
 * is there), and when it changes:
 *
 *   · the queued edit is PARKED under the account it belongs to — not sent to
 *     the new one and not thrown away (`parkPendingProfileEdit`);
 *   · the profile fields on the device are cleared, because they are a
 *     description of somebody else;
 *   · the marks saying which fields were typed and not sent are cleared, for
 *     the same reason — they describe the previous person's typing;
 *   · the upload memo is forgotten (`forgetProfileMedia`);
 *   · anything parked for the ARRIVING account is handed back, so somebody
 *     returning to a phone they used before still has their unsent edit.
 *
 * Only then does the fetch land, so the new person's profile is drawn from
 * their own row and nothing of the previous one is left underneath it.
 *
 * THIS RUNS ON EVERY SIGN-IN, NOT ONCE PER APP LOAD, and the difference is not
 * pedantic. The fetch is worth doing once per account per load; the account
 * COMPARISON is worth doing every time the session changes, because sign in as
 * A, then B, then A again without a reload and a once-per-load guard skips the
 * third one entirely — leaving B's photograph, bio and links on screen for A,
 * the owner record still saying B, and B's unsent edit still live in the
 * outbox. That is precisely the corruption this section exists to prevent, so
 * the two jobs are gated separately.
 *
 * IT IS NOT THE ONLY GUARD EITHER. `runFlush` checks the stamp on the queued
 * edit against the signed-in account before sending it, because this module
 * runs at one moment and `saveProfile` fires a flush at many.
 *
 * WHAT IS DELIBERATELY NOT CLEARED, so nobody reads more into this than it
 * does:
 *
 *   · the visibility, notification, recording and application settings in the
 *     same store, and everything in `AppState` — activities, goals, the
 *     passport. Those are the subject of the app's existing "signing out keeps
 *     your training" ruling, and quietly deleting a stranger's recorded climbs
 *     on a sign-in would be a far worse failure than the one this fixes.
 *
 *   · `heightCm`, `birthYear` and `ageBand` — answers about a body, named here
 *     because leaving them out of this list would let it read as exhaustive
 *     when it was not. They are NOT cleared, and the reason is that clearing
 *     them would not fix what it looks like it fixes: the daily energy figure
 *     they feed is computed mostly from `bodyMassKg`, which lives in `AppState`
 *     and stays by the ruling above. Clearing half a body would leave a figure
 *     computed from a mixture of two people rather than from one — worse, and
 *     harder to notice. The honest statement is that a shared phone shows the
 *     second person a nutrition figure derived from the first person's answers
 *     until they answer for themselves, and that this module is not the place
 *     that can end it.
 *
 * What IS this module's business is the profile — the thing that has somebody's
 * face and name on it.
 *
 * ── WHERE IT RUNS ───────────────────────────────────────────────────────────
 *
 * ONE PLACE: `useProfileHydration` in `App.tsx`'s `AppShell`, which is the
 * app-level session gate. That covers both moments — the app opening with a
 * session, and a sign-in, since `/auth/signin` is outside the shell and
 * navigating to `/home` mounts it. Once per account per app load; nothing here
 * runs on a timer, on reconnect, or on a token refresh.
 */
import { useEffect, useRef, useState } from "react";

import {
  fetchInterestTags,
  fetchMyProfile,
  flushProfile,
  forgetAllUnsentFields,
  forgetProfileMedia,
  parkPendingProfileEdit,
  pendingProfileEdit,
  profileOwner,
  PROFILE_FETCH_FAILED,
  rememberProfileOwner,
  restoreParkedProfileEdit,
  unsentProfileFields,
  type ProfileFetchFailure,
  type ProfileFieldName,
  type ServerProfile,
} from "@/settings/sync";
import {
  currentSettings,
  patchSettings,
  DEFAULT_SETTINGS,
  type SettingsState,
} from "@/settings/store";

/* -------------------------------------------------------------------------- */
/* Server field → the box on this device                                       */
/* -------------------------------------------------------------------------- */

/** The store's text fields, all of them `string` — "" is how it spells empty. */
type TextKey =
  | "region"
  | "bio"
  | "languages"
  | "interests"
  | "website"
  | "instagram"
  | "facebook"
  | "youtube"
  | "tiktok"
  | "strava";

/**
 * WHERE EACH SERVER FIELD LANDS, INCLUDING THE TWO THAT LAND NOWHERE.
 *
 * `displayName` is NOT written here. The name on this device lives in
 * `AppState`, is set from the server by `serverIdentity()` at sign-in, and is
 * rendered in the identity header straight off the row by `useMyProfile` —
 * three writers for one name would be two too many, and this module is not the
 * one that owns it.
 *
 * `countryCode` HAS NO BOX ON THIS DEVICE AT ALL. `SettingsState` has `region`
 * and nothing beside it, because `COUNTRY_IS_NEVER_PARSED` is why there is no
 * country picker yet. It is fetched — it is a live column and the read costs
 * nothing extra — and it is deliberately dropped here rather than folded into
 * the region box, which would put a country into a field the athlete typed a
 * town into.
 */
const TEXT_KEY_OF: Partial<Record<ProfileFieldName, TextKey>> = {
  region: "region",
  bio: "bio",
  languages: "languages",
  interests: "interests",
  website: "website",
  instagram: "instagram",
  facebook: "facebook",
  youtube: "youtube",
  tiktok: "tiktok",
  strava: "strava",
};

/** The profile as this device spells it, for the wipe on an account change. */
const DEVICE_PROFILE_FIELDS = [
  "avatar",
  "cover",
  "username",
  "region",
  "bio",
  "languages",
  "interests",
  "website",
  "instagram",
  "facebook",
  "youtube",
  "tiktok",
  "strava",
] as const satisfies readonly (keyof SettingsState)[];

/**
 * ISO codes back into words somebody can read.
 *
 * The column holds `["en","el"]` so that a search matches the language rather
 * than the spelling; a box reading "en, el" is a true statement rendered
 * uselessly. A code with no name in this locale is written AS THE CODE — which
 * still round-trips, because `sync.ts` matches a bare code as readily as a name.
 */
function languageText(codes: readonly string[]): string {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(undefined, { type: "language" });
  } catch {
    names = null;
  }
  return codes.map((code) => names?.of(code) ?? code).join(", ");
}

/**
 * Interest slugs back into the server's own labels.
 *
 * The vocabulary is a request of its own, so it is only asked for when there is
 * something to translate, and a failure falls back to the SLUGS rather than to
 * nothing: `interestSlugs` matches a slug exactly, so the box still round-trips
 * and the athlete's interests are still on the screen, spelled awkwardly.
 * Losing them to a failed lookup would be the worse trade.
 */
async function interestText(slugs: readonly string[]): Promise<string> {
  if (slugs.length === 0) return "";
  const vocabulary = await fetchInterestTags();
  if (!vocabulary.ok) return slugs.join(", ");
  return slugs
    .map((slug) => vocabulary.tags.find((tag) => tag.slug === slug)?.label ?? slug)
    .join(", ");
}

/* -------------------------------------------------------------------------- */
/* What happened, for the one sentence a screen may say about it               */
/* -------------------------------------------------------------------------- */

export type ProfileHydration =
  /** Nothing has been attempted on this app load. */
  | { kind: "idle" }
  | { kind: "fetching" }
  | {
      kind: "hydrated";
      /** Fields taken from the server. */
      applied: readonly ProfileFieldName[];
      /** Fields the device is holding unsent; the server's value was ignored. */
      keptUnsent: readonly ProfileFieldName[];
    }
  | {
      kind: "failed";
      failure: ProfileFetchFailure;
      message: string;
      /**
       * WHETHER A SCREEN SHOULD SAY THIS OUT LOUD.
       *
       * False for `no-backend` and `signed-out`: the first is the permanent and
       * unremarkable condition of a demo build — the same reasoning that took
       * the sync notes off the edit screen — and the second is a state the
       * route gate already handles, so a profile screen announcing it would be
       * telling somebody they are signed out on a screen they can only reach
       * signed in. Every other failure is news and is worth one sentence.
       */
      tell: boolean;
    };

let state: ProfileHydration = { kind: "idle" };
const listeners = new Set<(s: ProfileHydration) => void>();

function setState(next: ProfileHydration) {
  state = next;
  listeners.forEach((l) => l(next));
}

/** The current hydration state, for the sentence on the profile screen. */
export function useProfileHydrationState(): ProfileHydration {
  const [value, setValue] = useState(state);
  useEffect(() => {
    listeners.add(setValue);
    setValue(state);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

/* -------------------------------------------------------------------------- */
/* The act itself                                                              */
/* -------------------------------------------------------------------------- */

/** Accounts FETCHED on this app load. Not persisted: a fresh open should ask
    again, and asking twice in one session would be a request for nothing. It
    gates the request and nothing else — the account comparison runs every time
    the session changes, for the reason in the header. */
const done = new Set<string>();

/**
 * The account the app currently says is signed in.
 *
 * A fetch is not cancellable once it is out, and an answer for the previous
 * account must never land on this one's store. Every write below is preceded by
 * a check that this still names the account the answer is about — which is also
 * why nothing is dropped when a sign-in arrives mid-request: the new run simply
 * starts, and the old one abandons itself when it comes back.
 */
let latest: string | null = null;

/**
 * The account change, settled BEFORE the fetch so the new person's row never
 * lands on top of the old person's fields half-merged.
 *
 * Returns whether the previous person's queued edit is now safely put away.
 * `stranded` is not decoration: `parkPendingProfileEdit` says in as many words
 * that a park it could not write leaves the edit LIVE in the shared outbox, and
 * a live outbox is a thing `flushProfile()` sends to whoever is signed in.
 */
function handleAccountChange(previous: string, uid: string): "clear" | "stranded" {
  // The queued edit belongs to `previous` — it was made while they were signed
  // in — so it goes with them. See `parkPendingProfileEdit` for why it is not
  // simply deleted.
  const parked = parkPendingProfileEdit(previous);
  forgetProfileMedia();
  // The marks describe which boxes the PREVIOUS person had typed into and not
  // sent. Kept, they would make rule 1 refuse the arriving person's own server
  // values for those fields and leave them looking at a blank profile.
  forgetAllUnsentFields();

  const wipe: Partial<SettingsState> = {};
  for (const key of DEVICE_PROFILE_FIELDS) {
    // `avatar` and `cover` are optional and every reader tests them for
    // `undefined`; the rest are `string` and spell empty as "". Taking the
    // defaults from `DEFAULT_SETTINGS` rather than writing "" here means a
    // field that ever gains a different default cannot be reset to a wrong one.
    if (key === "avatar" || key === "cover") wipe[key] = undefined;
    else wipe[key] = DEFAULT_SETTINGS[key];
  }
  patchSettings(wipe);

  // If this account used this phone before and left something unsent, it is
  // theirs and comes back. Nothing is overwritten: the outbox was just cleared
  // by the park above, and `restoreParkedProfileEdit` refuses a live one anyway.
  if (parked === "parked" || parked === "nothing") restoreParkedProfileEdit(uid);

  return parked === "not-kept" ? "stranded" : "clear";
}

/**
 * Settle whose phone this is, on EVERY sign-in. Cheap, idempotent, and gated by
 * nothing — see the header for why it must not share the fetch's guard.
 */
function settleOwner(uid: string): "clear" | "stranded" {
  const previous = profileOwner();
  let verdict: "clear" | "stranded" = "clear";
  if (previous !== null && previous !== uid) {
    verdict = handleAccountChange(previous, uid);
    // Everything fetched on this app load was fetched for somebody else, and
    // the fields it filled have just been wiped. The arriving account is asked
    // about again even if it was already hydrated earlier in this same load.
    done.clear();
  }
  /*
   * An install with no owner recorded — every install before this module — is
   * treated as belonging to whoever is signing in now. That is an assumption
   * and it is the right one: the alternative is wiping the profile of the
   * person who has been using this phone all along, on their own phone, because
   * a key they never had is missing.
   */
  rememberProfileOwner(uid);
  return verdict;
}

async function hydrate(uid: string, stranded: boolean): Promise<void> {
  setState({ kind: "fetching" });

  /* What the device held when the question was asked. Anything that differs
     afterwards changed while the request was in flight — somebody typing — and
     is left alone. */
  const before = currentSettings();

  /*
   * THE QUEUED EDIT, IF IT IS THIS ACCOUNT'S.
   *
   * An entry stamped with somebody else's uid is in the live outbox because a
   * park failed — a phone with no room — and it is NOT this person's unsent
   * work. Honouring it under rule 1 would refuse the arriving athlete their own
   * server values and leave them looking at blank boxes on a profile they have
   * filled in. `runFlush` refuses to send it for the matching reason.
   *
   * `stranded` covers the case the stamp cannot: an entry written by a build
   * that did not stamp, left live by a failed park. It has no owner written on
   * it, this run knows the park failed, and that is enough to treat it as
   * foreign for this account.
   */
  const inOutbox = pendingProfileEdit();
  const queued =
    inOutbox === null || stranded || (inOutbox.uid !== undefined && inOutbox.uid !== uid)
      ? null
      : inOutbox;

  /* Rule 1's other half: typed and never sent at all. See the header. */
  const typedUnsent = unsentProfileFields();
  const isUnsent = (field: ProfileFieldName) =>
    (queued !== null && queued[field] !== undefined) || typedUnsent.includes(field);

  const result = await fetchMyProfile();
  /* Somebody signed in as somebody else while this was out. The answer is about
     an account this phone has stopped being, and the run that replaced it has
     already wiped the fields it would write into. */
  if (latest !== uid) return;

  if (!result.ok) {
    setState({
      kind: "failed",
      failure: result.failure,
      message: result.message,
      tell: result.failure !== "no-backend" && result.failure !== "signed-out",
    });
    return;
  }

  const profile: ServerProfile = result.profile;
  const now = currentSettings();
  const patch: Partial<SettingsState> = {};
  const applied: ProfileFieldName[] = [];
  const keptUnsent: ProfileFieldName[] = [];

  /** Rule 1 and the in-flight guard, asked once per field before rule 2. */
  const mayTake = (field: ProfileFieldName, key: keyof SettingsState): boolean => {
    if (isUnsent(field)) {
      keptUnsent.push(field);
      return false;
    }
    return now[key] === before[key];
  };

  const takeText = (field: ProfileFieldName, value: string | null | undefined) => {
    // RULE 3, and the two things it separates. `undefined` is a question that
    // was never answered — a column this deployment has not got, or a request
    // that failed. `null` or "" is an answer, and it is an EMPTY one. Neither
    // may empty the box on this phone.
    if (value === undefined || value === null || value.length === 0) return;
    const key = TEXT_KEY_OF[field];
    if (!key) return;
    if (!mayTake(field, key)) return;
    if (value === now[key]) return;
    patch[key] = value;
    applied.push(field);
  };

  const takePicture = (field: "avatar" | "banner", value: string | null | undefined) => {
    /* Rule 3 again, and this is the field it was written for: a photograph on
       this phone that no build ever had a way to upload is deleted by a plain
       "server wins", and there is nowhere to get it back from. An empty column
       leaves it exactly where it is. */
    if (value === undefined || value === null || value.length === 0) return;
    const key = field === "avatar" ? "avatar" : "cover";
    if (!mayTake(field, key)) return;
    /* An https URL into the public `profile-media` bucket, going into the same
       box a data URL goes into. Every surface in the app puts this value
       straight into an `<img src>`, which takes either form, and `Profile.tsx`
       already falls back to the athlete's initial if it does not load. */
    if (value === now[key]) return;
    patch[key] = value;
    applied.push(field);
  };

  takeText("region", profile.region);
  takeText("bio", profile.bio);
  takeText("website", profile.website);
  takeText("instagram", profile.instagram);
  takeText("facebook", profile.facebook);
  takeText("youtube", profile.youtube);
  takeText("tiktok", profile.tiktok);
  takeText("strava", profile.strava);
  takePicture("avatar", profile.avatar);
  takePicture("banner", profile.banner);

  if (profile.languages !== undefined) takeText("languages", languageText(profile.languages));

  /*
   * THE HANDLE, WHICH THIS MODULE CLEARS AND SO MUST BE ABLE TO REFILL.
   *
   * `settings.username` is the offline mirror of the claimed handle — the share
   * card and the settings header fall back to it with no signal, and without it
   * they build a slug out of the display name and show somebody a handle they
   * do not own. The account wipe clears it, so a read that could not refill it
   * would leave that fallback permanently wrong on a shared phone.
   *
   * It is NOT in `TEXT_KEY_OF` and never will be: that map is keyed by
   * `ProfileFieldName`, which is the list of things `saveProfile` can WRITE,
   * and a handle is claimed through `claim_username` precisely because changing
   * one gives the old one away. Rule 1 has nothing to say about it either — a
   * field with no write path can never be queued — so it is the in-flight guard
   * and rule 3 alone.
   */
  if (
    profile.username !== null &&
    profile.username.length > 0 &&
    now.username === before.username &&
    profile.username !== now.username
  ) {
    patch.username = profile.username;
  }

  /*
   * THE PATCH LANDS HERE, BEFORE THE INTERESTS LOOKUP AND NOT AFTER IT.
   *
   * Everything above came out of one request that has already answered. The
   * interests need a SECOND request — the vocabulary — with a six-second budget
   * of its own, and holding the athlete's face off the screen until a list of
   * words comes back would be waiting on something the face does not need.
   * Worse, the in-flight guard measured `now` before that wait, so anything
   * typed during it would have passed a comparison made seconds earlier.
   */
  if (Object.keys(patch).length > 0) patchSettings(patch);

  if (profile.interests !== undefined && profile.interests.length > 0) {
    /* Its own before-and-after, because its own request has its own wait. */
    const beforeTags = currentSettings();
    const text = await interestText(profile.interests);
    if (latest !== uid) return;
    const afterTags = currentSettings();
    if (
      !isUnsent("interests") &&
      afterTags.interests === beforeTags.interests &&
      text.length > 0 &&
      text !== afterTags.interests
    ) {
      patchSettings({ interests: text });
      applied.push("interests");
    } else if (isUnsent("interests")) {
      keptUnsent.push("interests");
    }
  }

  setState({ kind: "hydrated", applied, keptUnsent });

  /*
   * The server has just proved it answers, and this phone is holding something
   * it has not been told — the same evidence `saveProfile` acts on when it
   * drains the outbox after a success. Fire and forget: rule 1 has already kept
   * the queued value on screen, so nothing the athlete can see is waiting on it.
   *
   * `queued`, NOT the raw outbox: an edit that is not demonstrably this
   * account's is never sent from here. `runFlush` checks the same thing again
   * before it sends anything, because this is not the only caller.
   */
  if (queued !== null) void flushProfile();
}

/**
 * Fetch once per account per app load; settle the account on every sign-in.
 *
 * `uid` is `undefined` while the session is still being restored — which is NOT
 * "signed out", and starting a fetch on it would ask the server a question
 * about nobody. `null` is genuinely signed out, and there is nothing to fetch.
 */
export function useProfileHydration(uid: string | null | undefined): void {
  useEffect(() => {
    if (!uid) return;
    latest = uid;

    /* Every sign-in, whatever has been fetched already. See the header. */
    const stranded = settleOwner(uid) === "stranded";

    if (done.has(uid)) return;
    done.add(uid);

    /*
     * NOTHING IS DROPPED AND NOTHING IS LEFT HANGING.
     *
     * A run is not gated on another run being finished: a sign-in arriving mid
     * request used to be skipped outright and — because the effect depends only
     * on `uid` — never retried, so that account was neither wiped nor fetched
     * for the rest of the app load. `latest` is what keeps the two apart
     * instead, and it is checked before every write.
     *
     * The `catch` is not decoration either. `fetchMyProfile` says it never
     * throws and has no try/catch to guarantee it; `patchSettings` and the
     * vocabulary read are ordinary code. Without this the state would sit at
     * "fetching" for ever, `done` would refuse a retry, and the one sentence
     * this module exists to be able to say would never be said.
     */
    void hydrate(uid, stranded).catch(() => {
      if (latest !== uid) return;
      setState({
        kind: "failed",
        failure: "unknown",
        message: PROFILE_FETCH_FAILED,
        tell: true,
      });
    });
  }, [uid]);
}

/* ========================================================================== */
/* The coaching answers — same three rules, a different table                  */
/* ========================================================================== */

/**
 * THE OTHER HALF OF THE QUESTIONNAIRE COMES BACK TOO.
 *
 * Everything above this line is about `public.profiles` — the face, the name,
 * the bio, the links. The answers that decide what ICEFALL PRESCRIBES live on
 * `public.athlete_profiles`: equipment, training days, session length, skills,
 * altitude, strength experience, limitations, the objective and its date. Until
 * `sync.ts` grew `saveCoachingAnswers` / `fetchCoachingAnswers`, half of them
 * never left the phone at all and the other half were uploaded and never read
 * back.
 *
 * ── THE RULES ARE THE ONES IN THIS FILE'S HEADER. ALL THREE, UNCHANGED ─────
 *
 * They are not restated here and they are not adjusted here. `mayTakeCoaching`
 * below is the same shape as `mayTake` above: rule 1 (the device is holding it
 * unsent — it wins and stays queued), the in-flight guard, then rule 2 (the
 * server holds a value — it wins), then rule 3 (the server's column is empty —
 * the device keeps what it has; a fetch fills and corrects, it never empties).
 *
 * ── THE ONE FIELD WITH AN EXCEPTION, AND WHY IT IS NOT A FOURTH RULE ───────
 *
 * `objective` is restored ONLY onto a device that has none. The server holds a
 * name, an elevation and a date; the device holds a `Goal`, which is that plus
 * an id, a `trainingStartedAt`, a `preparation` figure derived from sessions
 * this athlete has actually completed, and a gap list. Rule 2 applied literally
 * would replace a training history with a name — and creating a second goal
 * instead would point Home, the Coach and the kit checklist at the same
 * mountain twice, with `usePrimaryGoal` picking whichever date is sooner.
 *
 * That is not the merge rule failing. It is rule 2's own justification not
 * holding: "either this phone sent it, or it is this athlete's more recent word
 * on the subject" is true of a bio and false of an object the device has been
 * accumulating evidence into. Where the device has no objective there is
 * nothing to protect and the ordinary rule runs.
 *
 * ── WHAT IS NOT CLEARED ON AN ACCOUNT CHANGE, SAID PLAINLY ────────────────
 *
 * `handleAccountChange` wipes the profile fields, and it does NOT wipe the
 * coaching answers — for the reason the header already gives for `heightCm`
 * and `birthYear`, plus one more that is specific to these. They are answers
 * about what somebody can train with and train around, they live in `AppState`
 * alongside the recorded training this app refuses to delete on a sign-in, and
 * a wipe would happen offline while the refill needs a signal: the athlete who
 * signs in on a plane would land with no equipment, no days and no limitations
 * and no way to get them back until they have a network.
 *
 * What this costs on a shared phone is bounded and worth stating: rule 2
 * replaces every answer the ARRIVING athlete has given, so what can survive is
 * only a field the arriving athlete has never answered — and the marks saying
 * which fields were typed and not sent ARE cleared with the rest, because those
 * describe the previous person's editing. The residue is real; it is smaller
 * than it was before this module existed, and it is not silent.
 */
import {
  fetchCoachingAnswers,
  forgetAllUnsentCoachingFields,
  forgetUnsentCoachingFields,
  noteUnsentCoachingField,
  saveCoachingAnswers,
  unsentCoachingFields,
  type CoachingAnswersEdit,
  type CoachingFieldName,
  type ServerCoachingAnswers,
} from "@/settings/sync";

/**
 * What this device currently holds, in the vocabulary `sync.ts` speaks.
 *
 * A SNAPSHOT AND NOT A STORE: the caller builds it from `AppState` and the
 * settings store, which is where each of these answers actually lives. This
 * module reads it twice — once before the request and once after — and that
 * comparison is the in-flight guard. `objective` present means this device has
 * one; its contents are not compared.
 */
export interface DeviceCoachingAnswers extends CoachingAnswersEdit {
  objective?: CoachingAnswersEdit["objective"];
}

export type CoachingHydration =
  | { kind: "idle" }
  | { kind: "fetching" }
  | {
      kind: "hydrated";
      applied: readonly CoachingFieldName[];
      keptUnsent: readonly CoachingFieldName[];
    }
  | { kind: "failed"; failure: ProfileFetchFailure; message: string; tell: boolean };

let coachingState: CoachingHydration = { kind: "idle" };
const coachingListeners = new Set<(s: CoachingHydration) => void>();

function setCoachingState(next: CoachingHydration) {
  coachingState = next;
  coachingListeners.forEach((l) => l(next));
}

/** For the one sentence the coaching-profile screen may say about a fetch. */
export function useCoachingHydrationState(): CoachingHydration {
  const [value, setValue] = useState(coachingState);
  useEffect(() => {
    coachingListeners.add(setValue);
    setValue(coachingState);
    return () => {
      coachingListeners.delete(setValue);
    };
  }, []);
  return value;
}

/**
 * RULE 3, ASKED ONCE: is this something the server actually said?
 *
 * `undefined` is a question that was never answered — the column is not on this
 * deployment, the request failed, or the record predates the field. `null` and
 * an empty list are ANSWERS, and they are empty ones. Neither may empty a box
 * on this phone.
 *
 * The one deliberate exception is a NUMBER OF ZERO, which is why this is not a
 * truthiness test: `maxAltitudeM: 0` is "I have never been above 1,000 m",
 * which is an answer worth restoring. `bestAltitude` is what decides zero is
 * not a floor to reason from; this function does not get to decide it by
 * throwing the value away.
 */
function serverSaidSomething(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}

/**
 * The merge, as a pure function, so it can be read in one sitting and reasoned
 * about without a session, a network or a React tree.
 */
export function mergeCoachingAnswers(
  server: ServerCoachingAnswers,
  before: DeviceCoachingAnswers,
  now: DeviceCoachingAnswers,
  unsent: readonly CoachingFieldName[],
): {
  patch: CoachingAnswersEdit;
  applied: CoachingFieldName[];
  keptUnsent: CoachingFieldName[];
} {
  const patch: CoachingAnswersEdit = {};
  const applied: CoachingFieldName[] = [];
  const keptUnsent: CoachingFieldName[] = [];

  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

  const take = <K extends keyof CoachingAnswersEdit & CoachingFieldName>(
    field: K,
    value: ServerCoachingAnswers[K & keyof ServerCoachingAnswers],
  ) => {
    if (unsent.includes(field)) {
      keptUnsent.push(field);
      return;
    }
    if (!serverSaidSomething(value)) return;
    /* Changed while the request was out — somebody is editing. Left alone. */
    if (!same(before[field], now[field])) return;
    if (same(now[field], value)) return;
    patch[field] = value as CoachingAnswersEdit[K];
    applied.push(field);
  };

  take("experience", server.experience ?? undefined);
  take("bodyMassKg", server.bodyMassKg ?? undefined);
  take("heightCm", server.heightCm ?? undefined);
  take("birthYear", server.birthYear ?? undefined);
  take("typicalSessionMin", server.typicalSessionMin ?? undefined);
  take("trainingDays", server.trainingDays);
  take("maxAltitudeM", server.maxAltitudeM ?? undefined);
  take("disciplines", server.disciplines);
  take("disciplineExperience", server.disciplineExperience);
  take("availableEquipment", server.availableEquipment);
  take("technicalSkills", server.technicalSkills);
  take("movementExperience", server.movementExperience ?? undefined);
  take("limitations", server.limitations);
  take("limitationsNote", server.limitationsNote ?? undefined);
  take("altitudeIllness", server.altitudeIllness ?? undefined);
  take("trainingBaseline", server.trainingBaseline ?? undefined);

  /* The exception argued at the top of this section. A device with an objective
     keeps it; a device with none is given the athlete's own back. */
  if (unsent.includes("objective")) keptUnsent.push("objective");
  else if (now.objective === undefined && server.objective?.goalName) {
    patch.objective = { ...server.objective, goalName: server.objective.goalName };
    applied.push("objective");
  }

  return { patch, applied, keptUnsent };
}

/** Accounts whose coaching answers have been fetched on this app load. */
const coachingDone = new Set<string>();
let coachingLatest: string | null = null;

/**
 * Fetch and merge the coaching answers once per account per app load, and send
 * anything this phone is holding unsent.
 *
 * `device` is a GETTER rather than a value because the guard needs two readings
 * a network round trip apart; `apply` is where the patch lands, and it is the
 * caller's because these answers live in `AppState` and the settings store,
 * neither of which this module is allowed to reach into.
 */
export function useCoachingHydration(
  uid: string | null | undefined,
  device: () => DeviceCoachingAnswers,
  apply: (patch: CoachingAnswersEdit) => void,
): void {
  /* Held in refs so a caller may pass fresh closures on every render — which it
     will, since they close over app state — without restarting the fetch. */
  const deviceRef = useRef(device);
  const applyRef = useRef(apply);
  deviceRef.current = device;
  applyRef.current = apply;

  useEffect(() => {
    if (!uid) return;
    coachingLatest = uid;

    /* The previous person's marks describe the previous person's editing. The
       profile half clears its own in `handleAccountChange`; this is the same
       act for this half, and it is gated on the same comparison. */
    const previous = profileOwner();
    if (previous !== null && previous !== uid) {
      forgetAllUnsentCoachingFields();
      coachingDone.clear();
    }

    if (coachingDone.has(uid)) return;
    coachingDone.add(uid);

    void (async () => {
      setCoachingState({ kind: "fetching" });
      const before = deviceRef.current();
      const unsent = unsentCoachingFields();

      const result = await fetchCoachingAnswers();
      if (coachingLatest !== uid) return;

      if (!result.ok) {
        setCoachingState({
          kind: "failed",
          failure: result.failure,
          message: result.message,
          tell: result.failure !== "no-backend" && result.failure !== "signed-out",
        });
      } else {
        const { patch, applied, keptUnsent } = mergeCoachingAnswers(
          result.coaching,
          before,
          deviceRef.current(),
          unsent,
        );
        if (Object.keys(patch).length > 0) applyRef.current(patch);
        setCoachingState({ kind: "hydrated", applied, keptUnsent });
      }

      /*
       * THE QUEUE DRAINS HERE, and it reads the CURRENT values rather than a
       * stored copy — see `COACHING_UNSENT_KEY` in `sync.ts` for why there is
       * no outbox. Fire and forget: rule 1 has already kept every unsent answer
       * on screen, so nothing the athlete can see is waiting on this.
       *
       * The marks are dropped on ATTEMPT and re-applied on failure, which is
       * the same promise `forgetUnsentProfileField` makes: a mark means "this
       * phone has never tried", and leaving it set after a try would make every
       * later fetch refuse the server for ever.
       */
      if (unsent.length === 0) return;
      const held = deviceRef.current();
      const send: CoachingAnswersEdit = {};
      for (const field of unsent) {
        const value = held[field];
        if (value !== undefined) (send as Record<string, unknown>)[field] = value;
      }
      if (Object.keys(send).length === 0) {
        forgetUnsentCoachingFields(unsent);
        return;
      }
      forgetUnsentCoachingFields(unsent);
      const sent = await saveCoachingAnswers(send);
      const failed = (Object.keys(sent.fields) as CoachingFieldName[]).filter(
        (f) => sent.fields[f]?.state !== "saved",
      );
      for (const field of failed) noteUnsentCoachingField(field);
    })();
  }, [uid]);
}
