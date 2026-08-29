import { GuidePhoto } from "@/components/ui";
import { DEMO_NOTICE, IS_DEMO } from "@/data/demo";
import { CONTRIBUTORS } from "@/data/social";
import { cn } from "@/lib/utils";

/**
 * The leaderboard.
 *
 * It ranks people by activity, which is the surface where invented data does
 * the most damage: a ranking asserts that these climbers exist, that they did
 * this much, and that one did more than another. All three would be false.
 *
 * `CONTRIBUTORS` is gated at its definition, so a production build has an empty
 * list and this page says so rather than showing a podium of nobody.
 */
export default function Leaderboard() {
  return (
    <div className="mx-auto w-full max-w-[880px] pb-16">
      <h1 className="text-[24px] font-light tracking-[-0.02em] text-snow">Leaderboard</h1>
      <p className="mt-1.5 text-[13px] text-mist">
        Ranked by posts, kudos given and summits logged this season.
      </p>

      {CONTRIBUTORS.length === 0 ? (
        <div className="mt-6 rounded-card border border-hairline bg-graphite p-6">
          <p className="text-[13px] text-mist">No rankings yet.</p>
          <p className="mt-1.5 text-[12px] text-mist-dim">
            A leaderboard needs real activity behind it. This one fills from posts, and there are
            no accounts yet.
          </p>
        </div>
      ) : (
        <ol className="mt-6 divide-y divide-hairline overflow-hidden rounded-card border border-hairline bg-graphite">
          {CONTRIBUTORS.map((c, i) => (
            <li key={c.id} className="flex items-center gap-4 px-5 py-4">
              <span
                className={cn(
                  "tnum grid h-8 w-8 shrink-0 place-items-center rounded-pill text-[12px]",
                  i === 0
                    ? "bg-gilt/15 text-gilt"
                    : i < 3
                      ? "border border-azure/40 text-azure"
                      : "border border-hairline text-mist-dim",
                )}
              >
                {i + 1}
              </span>
              <GuidePhoto name={c.name} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-snow">{c.name}</span>
                <span className="tnum mt-0.5 block text-[11.5px] text-mist-dim">
                  {c.posts} posts
                </span>
              </span>
              <span className="tnum shrink-0 text-right text-[15px] text-snow">
                {c.points.toLocaleString("en-GB")}
                <span className="ml-1 text-[11px] text-mist-dim">pts</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {IS_DEMO && (
        <p className="mt-8 border-t border-hairline pt-4 text-[11px] leading-relaxed text-mist-dim">
          {DEMO_NOTICE} These climbers and their scores are invented to show the layout.
        </p>
      )}
    </div>
  );
}
