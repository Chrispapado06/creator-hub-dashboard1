/**
 * The words on the "No signal" row (brief M3), kept apart from the component so
 * they can be tested without a router.
 *
 * WHEN IT IS A TRIP DATE THE ROW NAMES THE TRIP. "No signal — switch?" is a
 * question about the app; "day 3 of Gouter" is the reason to answer it, and it
 * is the difference between a banner somebody swipes past and one they read.
 * The day number is the trip's own arithmetic, never a guess.
 */
export function offerMessage(input: {
  dismissed: boolean;
  tripName: string | null;
  /** 1-based, and only when the trip is running today. */
  dayNumber: number | null;
}): string {
  if (input.dismissed) return "No signal — pages you have already opened are saved on this phone.";
  if (input.tripName && input.dayNumber !== null) {
    return `No signal · day ${input.dayNumber} of ${input.tripName}. Switch to Mountain mode?`;
  }
  return "No signal — switch to Mountain mode?";
}
