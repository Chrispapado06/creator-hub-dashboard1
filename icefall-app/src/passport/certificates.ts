import { useEffect, useState } from "react";

import { ATHLETE_SKILLS, SKILL_LABEL, type AthleteSkillId } from "@/objectives/requirements";
import type { Provenance } from "@/passport/model";

/**
 * CERTIFICATES THE ATHLETE HOLDS — AND WHY HOLDING ONE STILL SAYS
 * "SELF-REPORTED".
 *
 * ============================================================================
 * THE ROADMAP ASKS FOR SOMETHING THIS FILE DELIBERATELY DOES NOT DO
 * ============================================================================
 *
 * Phase 3: "A missing skill that blocks the objective leads to a course
 * recommendation. Uploading the certificate marks the skill as verified on the
 * passport."
 *
 * IT DOES NOT MARK IT VERIFIED, and it must not, because nothing checks it.
 *
 * `passport/model.ts` is explicit about the reason and this file inherits it
 * whole: ICEFALL has no verification system. Nobody rings the awarding body.
 * Nobody reads the document. Nobody compares the name on it with the name on
 * the account. A passport is a credential and it may well be handed to a guide
 * or an expedition company deciding whether this person is competent for a
 * mountain — so the word "verified" beside an unchecked upload is not a display
 * choice, it is a false statement about a safety-critical judgement, made by us,
 * to a stranger, about somebody whose life depends on the answer.
 *
 * `Provenance` in `passport/model.ts` HAS a `verified` member and NOTHING IN
 * THIS BUILD RETURNS IT. That is still true after this file. A certificate
 * record is `self-reported`, it renders as self-reported, and the reason is
 * printed beside it rather than buried in a settings page.
 *
 * WHAT A CERTIFICATE RECORD IS ACTUALLY FOR, THEN. Three real things:
 *
 *   1. It is the athlete's own note of what they did and when, in the place
 *      they will look for it — beside the competence it belongs to.
 *   2. It carries the AWARDING BODY, which is the single most useful line on
 *      any certificate and the one a guide would actually ask about.
 *   3. It is the seam. The day a real check exists — a body's register, an
 *      operator confirming a course, a guide signing — this is the record that
 *      gets a checked flag, and `provenance` becomes something other than a
 *      constant. Until then it is a constant on purpose.
 *
 * ============================================================================
 * THE FILE ITSELF IS NOT KEPT, AND THE APP SAYS SO
 * ============================================================================
 *
 * ICEFALL has no document storage. There is no bucket, no server table and no
 * IndexedDB store for files anywhere in this app, and `localStorage` is a hard
 * ~5 MB shared with the training plan, the activity feed and every other
 * `icefall.` key — a single phone photo of a certificate would fill a
 * meaningful share of it and eventually evict somebody's plan.
 *
 * So when an athlete picks a file, ICEFALL records its NAME, TYPE AND SIZE and
 * nothing else, so they can see which document they meant. The bytes are not
 * read, not stored and not sent anywhere. `DOCUMENT_NOTICE` says exactly that
 * on the screen. Calling that an "upload" would be the second lie in a feature
 * whose whole job is to avoid the first.
 */

/* -------------------------------------------------------------------------- */
/* The record                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A file the athlete pointed at. METADATA ONLY — see the header.
 *
 * There is no `url`, no `dataUrl` and no `content` field, and adding one would
 * need a real answer to where the bytes live and who can read them.
 */
export interface CertificateDocument {
  fileName: string;
  /** The browser's reported MIME type. Reported, not checked. */
  mimeType: string;
  sizeBytes: number;
  /** When the athlete chose it, ISO instant. */
  chosenAt: string;
}

export interface SkillCertificate {
  id: string;
  /** The competence this certificate is claimed against. One of the fifteen. */
  skillId: AthleteSkillId;
  /** As printed on the certificate. The athlete's typing. */
  courseName: string;
  /** The body that awarded it. The line a guide would actually ask about. */
  awardedBy: string;
  /** YYYY-MM-DD. The athlete's typing. */
  completedOn: string;
  document?: CertificateDocument;
  /** When the record was made, ISO instant. */
  at: string;
}

/**
 * THE PROVENANCE OF EVERY CERTIFICATE, WITHOUT EXCEPTION.
 *
 * A constant rather than a field, so there is no per-record value anybody can
 * set to something else and no code path that could return `"verified"`. If
 * ICEFALL ever gains a real check, this becomes a function of the record and
 * that change is one this comment should be deleted in.
 */
export const CERTIFICATE_PROVENANCE: Provenance = "self-reported";

/** Printed beside every certificate on the passport and the skill-gap screen. */
export const CERTIFICATE_NOTICE =
  "Self-reported. ICEFALL has not seen this certificate and has not checked it with the awarding body — there is no verification system in the app. It is your own record of your own course, and anyone deciding whether you are competent for an objective should ask you for the certificate itself.";

/** Printed beside the file picker, before anyone taps it. */
export const DOCUMENT_NOTICE =
  "ICEFALL records the file's name, type and size so you know which document you meant. The file itself is not stored, not uploaded and not sent anywhere — there is no document storage in the app yet.";

/**
 * Printed where the athlete might reasonably expect a tick to appear.
 *
 * The tick on a competence comes from the coaching profile, which the athlete
 * controls. Adding a certificate does NOT tick it for them — see
 * `objectives/skillGaps.ts` for the argument.
 */
export const CERTIFICATE_DOES_NOT_TICK =
  "Adding a certificate does not tick the competence for you. ICEFALL will not put a claim in your profile that you did not make — tap the competence itself if you want it counted.";

export const MAX_TEXT_CHARS = 120;
/** More than one course per competence is normal; a hundred is a bug. */
const MAX_CERTIFICATES = 100;

export function certificateSkillLabel(c: SkillCertificate): string {
  return SKILL_LABEL[c.skillId] ?? c.skillId;
}

/** Every certificate claimed against one competence, newest course first. */
export function certificatesForSkill(
  all: readonly SkillCertificate[],
  skillId: AthleteSkillId,
): SkillCertificate[] {
  return all
    .filter((c) => c.skillId === skillId)
    .sort((a, b) => (a.completedOn < b.completedOn ? 1 : -1));
}

/** Human file size for the metadata line. Binary units, one decimal. */
export function readableSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown size";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* -------------------------------------------------------------------------- */
/* Store — this device, like every other ICEFALL store                         */
/* -------------------------------------------------------------------------- */

const KEY = "icefall.certificates.v1";

export const CERTIFICATE_STORAGE_NOTICE =
  "Certificates are kept on this phone. There is no server table for them yet, so a new phone starts empty, and erasing your data in Settings takes them with it.";

interface Stored {
  certificates: SkillCertificate[];
}

const EMPTY: Stored = { certificates: [] };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(v: unknown): v is string {
  if (typeof v !== "string" || !DATE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

const SKILL_IDS: readonly string[] = ATHLETE_SKILLS.map((s) => s.id);

function isCertificate(v: unknown): v is SkillCertificate {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Partial<SkillCertificate>;
  return (
    typeof c.id === "string" &&
    typeof c.skillId === "string" &&
    SKILL_IDS.includes(c.skillId) &&
    typeof c.courseName === "string" &&
    c.courseName.length > 0 &&
    typeof c.awardedBy === "string" &&
    c.awardedBy.length > 0 &&
    isCalendarDate(c.completedOn) &&
    typeof c.at === "string"
  );
}

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return {
      certificates: Array.isArray(parsed.certificates)
        ? parsed.certificates.filter(isCertificate)
        : [],
    };
  } catch {
    /* Corrupt storage reads as "no certificates", which is safe: the passport
       shows fewer claims than the athlete made, which is visible to them. The
       opposite failure — showing a claim nobody made — is not. */
    return EMPTY;
  }
}

const listeners = new Set<(s: Stored) => void>();
let current: Stored = typeof localStorage === "undefined" ? EMPTY : read();

function write(next: Stored) {
  const list = next.certificates;
  current = { certificates: list.length > MAX_CERTIFICATES ? list.slice(-MAX_CERTIFICATES) : list };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* Private mode or a full quota. Held for this session only, and
       CERTIFICATE_STORAGE_NOTICE on the screen is what stops that being a
       surprise. */
  }
  listeners.forEach((l) => l(current));
}

let seq = 0;
function newId(): string {
  seq += 1;
  return `cert-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface NewCertificate {
  skillId: AthleteSkillId;
  courseName: string;
  awardedBy: string;
  completedOn: string;
  document?: CertificateDocument;
}

export function currentCertificates(): readonly SkillCertificate[] {
  return current.certificates;
}

/**
 * Record one certificate. Returns it, or NULL when a field is unusable.
 *
 * Null rather than a coerced record, for the same reason as every other store
 * in this app: a blank awarding body silently saved as "" would put an empty
 * line on a document somebody may hand to a guide.
 */
export function addCertificate(c: NewCertificate): SkillCertificate | null {
  const record: SkillCertificate = {
    id: newId(),
    skillId: c.skillId,
    courseName: c.courseName.trim().slice(0, MAX_TEXT_CHARS),
    awardedBy: c.awardedBy.trim().slice(0, MAX_TEXT_CHARS),
    completedOn: c.completedOn,
    at: new Date().toISOString(),
  };
  if (c.document) {
    record.document = {
      fileName: c.document.fileName.slice(0, MAX_TEXT_CHARS),
      mimeType: c.document.mimeType.slice(0, MAX_TEXT_CHARS),
      sizeBytes: Math.max(0, Math.round(c.document.sizeBytes)),
      chosenAt: c.document.chosenAt,
    };
  }

  if (!isCertificate(record)) return null;

  write({ certificates: [...current.certificates, record] });
  return record;
}

export function forgetCertificate(id: string): void {
  write({ certificates: current.certificates.filter((c) => c.id !== id) });
}

export function clearCertificates(): void {
  write(EMPTY);
}

function useStore(): Stored {
  const [state, setState] = useState(current);
  useEffect(() => {
    listeners.add(setState);
    setState(current);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}

export function useCertificates(): readonly SkillCertificate[] {
  return useStore().certificates;
}
