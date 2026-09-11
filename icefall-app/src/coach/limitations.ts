/**
 * What ICEFALL must train AROUND — the declared limitations, in one place.
 *
 * THE BOUNDARY, AND WHY IT IS THE WHOLE POINT OF THIS QUESTION.
 *
 * The coach's system prompt already says "You are NOT a doctor. Defer anything
 * medical." That instruction stays, and this answer does not soften it. What
 * this list does is CONSTRAIN WHAT MAY BE PRESCRIBED — it must never invite
 * diagnosis, interpretation or reassurance.
 *
 * So: the coach may avoid loading a declared knee. It may not say what is wrong
 * with the knee, may not suggest it is healing, and may not adjust "because of"
 * a condition in a way that reads as a medical judgement. The answer travels as
 * a hard constraint list, never as clinical context — the coach chooses from
 * what it may prescribe rather than reasoning about a body it never examined.
 *
 * These are broad categories on purpose. A finer list would invite people to
 * describe a diagnosis, which is exactly the thing this must not collect.
 *
 * WHY THE LIST MOVED HERE FROM ONBOARDING, where it was written. Three surfaces
 * now read these ids — the onboarding step that collects them, the session
 * engine that trains around them, and the chat context that tells the model
 * what the engine already did. Two of those would have had to guess a label
 * from an id, and a second hand-written copy of "ankle-foot" is the kind of
 * drift that ends with a declared limitation silently matching nothing.
 */

export interface LimitationOption {
  id: string;
  label: string;
}

export const LIMITATIONS: LimitationOption[] = [
  { id: "knee", label: "Knee" },
  { id: "back", label: "Back" },
  { id: "shoulder", label: "Shoulder" },
  { id: "ankle-foot", label: "Ankle or foot" },
  { id: "breathing", label: "Asthma or breathing" },
  { id: "heart", label: "Heart" },
  { id: "recent-surgery", label: "Recent surgery" },
  { id: "other", label: "Something else" },
];

/**
 * An id back to the words the athlete actually tapped.
 *
 * An unknown id is de-slugged rather than dropped. A profile written by an
 * older build can carry an id this list has since renamed, and rendering
 * "old-injury" as "old injury" is honest; omitting it would quietly shrink the
 * athlete's own answer to fit a list they never saw.
 */
export function limitationLabel(id: string): string {
  const known = LIMITATIONS.find((l) => l.id === id);
  if (known) return known.label;
  return id.replace(/[-_]+/g, " ").trim();
}

/** The declared limitations as labels, in the order the athlete chose them. */
export function limitationLabels(ids: string[]): string[] {
  return ids.map(limitationLabel).filter((l) => l.length > 0);
}
