/**
 * The one departure date the whole web app counts down to.
 *
 * Four pages held their own copy and they disagreed: Home and Coach said
 * 10 May 2027, Bookings and Notifications said 31 March 2027 — for the SAME
 * Everest booking. Two of them carried comments insisting the pages must not
 * contradict each other, which is how you can tell a duplicated constant is
 * the wrong shape rather than the wrong value. Coach's 38-week build was
 * anchored six weeks after the date Bookings printed on the same trip.
 *
 * A fixed UTC instant, so the countdown ticks toward the same moment for
 * every reader, and so the label and the clock cannot drift apart.
 */
export const DEPARTURE = new Date("2027-03-31T06:00:00Z");

/** The same date as an ISO day, for anything formatting rather than counting. */
export const DEPARTURE_ISO = "2027-03-31";

/** "31 March 2027" */
export const departureLabel = (): string =>
  DEPARTURE.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
