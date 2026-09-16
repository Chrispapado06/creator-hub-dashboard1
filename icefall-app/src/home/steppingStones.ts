/**
 * Stepping stones the MOUNTAIN RECORD itself names.
 *
 * Home's "One thing to explore" card prints `line` under the peak. It is
 * quoted from that mountain's own record in `data/mock/mountains.ts`, not
 * written here, because a line like "closes your altitude gap" would be a claim
 * about the athlete nothing in ICEFALL makes. `homeState.test.ts` fails if the
 * record stops saying it.
 */
export const STEPPING_STONE_QUOTES: Record<string, { id: string; line: string }> = {
  "mont-blanc": { id: "gran-paradiso", line: "The conventional stepping stone to Mont Blanc" },
};
