import { useEffect, useState } from "react";
import { supabase } from "@/backend/client";
import { guideAccess, onAuthChange, type GuideAccess } from "@/auth/account";
import { readCredentials, type CredentialsState } from "./credentials";
import { ME, type GuideProfile } from "@/data/demo";

/**
 * WHO THE APP IS SHOWING, AND WHERE THAT CAME FROM.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS EXISTS TO CLOSE. Home and Profile read `ME` — the invented
 * sample guide — no matter who was signed in. So a real person could sign in
 * with their own ICEFALL account and be greeted by somebody else's name, with
 * somebody else's bookings, **wearing the gold credentials mark**.
 *
 * The mark is the serious half. Verification reads the REAL, server-derived
 * `guide_credentials_state`; Home and Profile were deriving the same claim from
 * the seed's approved application. Two sources for one claim — the exact thing
 * the badge work said must never happen — so a signed-in guide whom ICEFALL has
 * never checked would still see gold on their own home screen.
 *
 * Nothing was edited to cause it: sign-in arrived, and screens written when
 * there was no such thing as a session carried on reading the sample.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * THE RULE: THE SAMPLE IS ONLY EVER SHOWN WHEN NOBODY IS SIGNED IN. A session
 * displaces it entirely rather than being merged with it — a screen that mixes a
 * real account with invented figures is one where no individual number can be
 * trusted, and the demo banner cannot say which half it covers.
 */

export type Identity =
  /** Nobody signed in and the demo flag is on: the invented guide. */
  | { mode: "sample"; profile: GuideProfile; credentials: CredentialsState | null }
  /** A real session. `credentials` is the SERVER's answer, never the seed's. */
  | {
      mode: "session";
      label: string;
      isGuide: boolean;
      /**
       * True when the GUIDE CHECK ITSELF failed — a timeout, a 503, one bar of
       * signal in a hut. Distinct from `isGuide: false`, which is a real answer
       * meaning this account is not a guide's. Collapsing the two told verified
       * guides "your account is not a guide account" whenever the network
       * hiccuped, which is the credentials mistake (`credentialsUnreadable`)
       * repeated one field up: a failed read is not a negative answer.
       */
      guideUnreadable: boolean;
      credentials: CredentialsState | null;
      /** True when the credential state could not be read — not "unchecked". */
      credentialsUnreadable: boolean;
    }
  /** No session and no sample: an ordinary build with nobody signed in. */
  | { mode: "none" };

export interface IdentityReading {
  loading: boolean;
  identity: Identity;
}

async function read(): Promise<Identity> {
  const access: GuideAccess = await guideAccess();

  if (access === "signed-out" || access === "offline") {
    /* Only here may the sample appear. `ME` is null in any build without the
       demo flag, which collapses this to `none` on its own. */
    return ME ? { mode: "sample", profile: ME, credentials: null } : { mode: "none" };
  }

  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const label = data.user?.email ?? "Your account";

  const creds = await readCredentials();
  return {
    mode: "session",
    label,
    isGuide: access === "guide",
    /* "unknown" is the failed-read state from `guideAccess()`, not a verdict. */
    guideUnreadable: access === "unknown",
    credentials: creds.status === "record" ? creds.record.state : null,
    /* "We could not read it" is NOT "unchecked" — the distinction survives all
       the way to the mark, because only one of them means no gold. */
    credentialsUnreadable: creds.status !== "record",
  };
}

export function useIdentity(): IdentityReading {
  const [identity, setIdentity] = useState<Identity | null>(null);

  useEffect(() => {
    let alive = true;
    const go = () => void read().then((i) => alive && setIdentity(i));
    go();
    const off = onAuthChange(go);
    return () => {
      alive = false;
      off();
    };
  }, []);

  return { loading: identity === null, identity: identity ?? { mode: "none" } };
}

/**
 * Whether the gold credentials mark may be shown.
 *
 * ONE SOURCE, AND IT IS THE SERVER'S when there is a session. A real account
 * gets the mark only from `guide_credentials_state = 'checked'`. An unreadable
 * state never earns it — a mark shown because a request failed is a claim made
 * by a timeout.
 *
 * `sampleApproved` is the sample's separate answer, and the CALLER supplies it
 * rather than this function reading the seed, so the seed cannot grant a mark
 * behind a screen's back. As of 2026-09-04 no caller can pass `true`: the seed
 * application is `submitted`, not `approved`, because a dated ICEFALL
 * inspection is a claim about ICEFALL that no sample label can cover (see
 * `data/demo.ts`). The parameter stays because the question — "may an invented
 * account wear the mark?" — is the caller's to answer, not this file's.
 */
export function showsCredentialMark(i: Identity, sampleApproved: boolean): boolean {
  if (i.mode === "sample") return sampleApproved;
  if (i.mode === "session") return i.isGuide && i.credentials === "checked";
  return false;
}
