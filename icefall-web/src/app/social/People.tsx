import { GuidePhoto } from "@/components/ui";
import { DEMO_NOTICE, IS_DEMO } from "@/data/demo";
import { CONTRIBUTORS, POSTS } from "@/data/social";
import { peakByName, PEAKS } from "@/data/peaks";

/**
 * People.
 *
 * Built from who has actually posted rather than from a separate directory of
 * profiles. The phone app keeps its equivalent list EMPTY on purpose — a
 * "discover people" screen populated with fictional athletes is the clearest
 * possible misrepresentation of how many people use a product — so this one
 * derives from the feed and empties itself with it.
 */
export default function People() {
  const authors = [...new Set(POSTS.map((p) => p.author))].map((name) => {
    const posts = POSTS.filter((p) => p.author === name);
    const peaks = [...new Set(posts.map((p) => p.peakId))];
    const contributor = CONTRIBUTORS.find((c) => c.name === name);
    return { name, posts: posts.length, peaks, points: contributor?.points ?? null };
  });

  return (
    <div className="mx-auto w-full max-w-[1100px] pb-16">
      <h1 className="text-[24px] font-light tracking-[-0.02em] text-snow">People</h1>
      <p className="mt-1.5 text-[13px] text-mist">Climbers posting from the mountains right now.</p>

      {authors.length === 0 ? (
        <div className="mt-6 rounded-card border border-hairline bg-graphite p-6">
          <p className="text-[13px] text-mist">Nobody has posted yet.</p>
          <p className="mt-1.5 text-[12px] text-mist-dim">
            This list is built from the feed. It stays empty until there are real accounts behind
            it.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {authors.map((a) => (
            <article
              key={a.name}
              className="flex items-start gap-3.5 rounded-card border border-hairline bg-graphite p-5"
            >
              <GuidePhoto name={a.name} size={48} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] text-snow">{a.name}</p>
                <p className="tnum mt-0.5 text-[11.5px] text-mist-dim">
                  {a.posts} {a.posts === 1 ? "post" : "posts"}
                  {a.points !== null && ` · ${a.points.toLocaleString("en-GB")} pts`}
                </p>
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {a.peaks.map((id) => {
                    const peak = PEAKS.find((p) => p.id === id) ?? peakByName(id);
                    return (
                      <span
                        key={id}
                        className="rounded-pill border border-hairline px-2 py-0.5 text-[10.5px] text-mist"
                      >
                        {peak?.name ?? id}
                      </span>
                    );
                  })}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}

      {IS_DEMO && (
        <p className="mt-8 border-t border-hairline pt-4 text-[11px] leading-relaxed text-mist-dim">
          {DEMO_NOTICE} Nobody listed here has an account.
        </p>
      )}
    </div>
  );
}
