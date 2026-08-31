/**
 * The section model behind the in-layout editor.
 *
 * A "section" is a block of the real customer-facing page, the fields that feed
 * it, and — the part that earns the left rail — WHERE THOSE FIELDS CURRENTLY
 * STAND with ICEFALL. An operator's most common question is "which bit of my
 * page is stuck with you?", and the whole point of the rail is that they can
 * answer it at a glance instead of emailing to ask.
 *
 * SECTIONS ARE PER-SURFACE. The phone is not the desktop page at a narrow
 * width — it is a different layout with fewer tabs, so some sections do not
 * exist there at all. Rather than show a phantom row that edits nothing, a
 * section absent from the selected surface says so. That is why the device
 * switch is labelled "Editing for" and not "Preview": choosing App changes what
 * you are editing, not just how it is drawn.
 */

import type { Company, ContentVersion } from "@/domain/types";

export type Surface = "web" | "app";

/**
 * Where a section stands. Three states, and the middle one is the reason the
 * rail exists.
 *
 *   live    — what is published is what you last agreed with ICEFALL.
 *   pending — you sent a change and ICEFALL has not decided yet. The live
 *             version is still what climbers see.
 *   edited  — you have changed something and NOT sent it. Nobody but your team
 *             can see it, including ICEFALL.
 */
export type SectionState = "live" | "pending" | "edited";

export interface SectionDef {
  key: string;
  label: string;
  /** Company fields this section publishes. Drives status and the inspector. */
  fields: readonly (keyof Company)[];
  /** Surfaces that actually render it. */
  surfaces: readonly Surface[];
  /** Shown in the inspector header when the section is entirely ICEFALL's. */
  readOnly?: boolean;
}

/**
 * The company page, in the order a climber meets it.
 *
 * `surfaces` is not a guess — it mirrors what each app renders.
 * `icefall-web/src/app/Company.tsx` carries eight tabs (Overview, Expeditions,
 * Treks, Reviews, Team, Gallery, About, FAQ); the phone company view is
 * shorter. A section listed for `web` only is one the phone has no room for,
 * and editing it while "Editing for: App" is selected would be editing
 * something the operator cannot see in front of them.
 */
export const COMPANY_SECTIONS: readonly SectionDef[] = [
  {
    key: "hero",
    label: "Hero",
    /*
     * `logoMediaId` IS IN THIS LIST BECAUSE THE PROFILE ALREADY COUNTED IT.
     *
     * `CompanyProfile`'s completeness checklist has always scored
     * `logoMediaId` under "Media & photos", so the profile told an operator a
     * logo counted towards being publishable while no screen anywhere let them
     * supply one. That is a checklist row that cannot be satisfied — the worst
     * kind, because it reads as the operator's omission. The field belongs to
     * the hero (the logo sits above the company name), so it is declared here
     * and the hero inspector now carries the drop for it.
     */
    fields: ["name", "tagline", "city", "country", "foundedYear", "bannerMediaId", "logoMediaId"],
    surfaces: ["web", "app"],
  },
  {
    key: "about",
    label: "About",
    fields: ["description", "about"],
    surfaces: ["web", "app"],
  },
  {
    key: "why",
    label: "Why climb with us",
    fields: ["whyChooseUs"],
    surfaces: ["web", "app"],
  },
  /*
   * NO "video" SECTION. Owner decision #15: the promotional film belongs to
   * the mountain surface, not the company — so the company page has no film
   * row for an operator to fill, rather than a hidden or disabled one.
   */
  {
    key: "credentials",
    label: "Certifications",
    fields: ["certifications"],
    surfaces: ["web", "app"],
  },
  {
    key: "team",
    label: "Team",
    fields: ["team"],
    surfaces: ["web", "app"],
  },
  {
    key: "faq",
    label: "FAQ",
    fields: ["faq"],
    surfaces: ["web"],
  },
  {
    /**
     * Entirely ICEFALL's, and present so the operator can SEE it rather than
     * wonder where it went. Locked, not hidden — a padlocked statement says what
     * is true, where an absent row invites the email this rail exists to prevent.
     */
    key: "icefall",
    label: "Set by Icefall",
    fields: [],
    surfaces: ["web", "app"],
    readOnly: true,
  },
] as const;

export const sectionsFor = (surface: Surface): SectionDef[] =>
  COMPANY_SECTIONS.filter((s) => s.surfaces.includes(surface));

/**
 * Which fields a pending submission has claimed.
 *
 * `changedFields` is derived by a trigger in the schema, so it is the
 * authoritative answer to "what is in review" — more reliable than re-deriving
 * it from the payload here, and it is what the Approval Center is looking at.
 */
export function pendingFields(versions: readonly ContentVersion[]): Set<string> {
  const out = new Set<string>();
  for (const v of versions) {
    if (v.state !== "pending") continue;
    for (const f of v.changedFields) out.add(f);
    // A version whose trigger has not run yet still tells us via its payload.
    for (const f of Object.keys(v.payload)) out.add(f);
  }
  return out;
}

/**
 * The dot beside a section in the rail.
 *
 * Order matters: PENDING WINS OVER EDITED. If one field of a section is with
 * ICEFALL and another has been touched locally, the operator most needs to know
 * the first — it is the one they cannot act on, and the one they would
 * otherwise chase.
 */
export function sectionState(
  section: SectionDef,
  pending: ReadonlySet<string>,
  locallyEdited: ReadonlySet<string>,
): SectionState {
  if (section.fields.some((f) => pending.has(f as string))) return "pending";
  if (section.fields.some((f) => locallyEdited.has(f as string))) return "edited";
  return "live";
}

export const SECTION_STATE_LABEL: Record<SectionState, string> = {
  live: "Live",
  pending: "Waiting on Icefall",
  edited: "Edited, not sent",
};

/** Hue-separated, and the same three colours the status chips already use. */
export const SECTION_STATE_COLOUR: Record<SectionState, string> = {
  live: "var(--op-live)",
  pending: "var(--op-pending)",
  edited: "var(--op-faint)",
};
