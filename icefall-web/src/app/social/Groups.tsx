import { DEMO_NOTICE, IS_DEMO } from "@/data/demo";
import { GROUPS } from "@/data/social";
import { peakFallback, peakImage } from "../peakPlate";

/** Groups — invented, definition-gated, same as the rest of the feed. */
export default function Groups() {
  return (
    <div className="mx-auto w-full max-w-[1100px] pb-16">
      <h1 className="text-[24px] font-light tracking-[-0.02em] text-snow">Groups</h1>
      <p className="mt-1.5 text-[13px] text-mist">
        Season teams, partner-finding and conditions reports.
      </p>

      {GROUPS.length === 0 ? (
        <div className="mt-6 rounded-card border border-hairline bg-graphite p-6">
          <p className="text-[13px] text-mist">No groups yet.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {GROUPS.map((g) => (
            <article
              key={g.id}
              className="overflow-hidden rounded-card border border-hairline bg-graphite"
            >
              <div className="relative h-[112px]">
                <img
                  src={peakImage(g.peakId)}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  onError={(ev) => {
                    const el = ev.currentTarget;
                    if (!el.dataset.fellBack) {
                      el.dataset.fellBack = "1";
                      el.src = peakFallback(g.peakId);
                    }
                  }}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 scrim-bottom" />
              </div>
              <div className="p-4">
                <p className="text-[14px] leading-tight text-snow">{g.name}</p>
                <p className="tnum mt-1 text-[11.5px] text-mist-dim">
                  {g.members.toLocaleString("en-GB")} members
                </p>
                <p className="mt-2 text-[12px] leading-relaxed text-mist">{g.blurb}</p>
                <button
                  type="button"
                  className="mt-3.5 w-full rounded-pill border border-azure/45 py-2 text-[12.5px] text-azure transition-colors hover:border-azure hover:text-azure-bright"
                >
                  Join
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {IS_DEMO && (
        <p className="mt-8 border-t border-hairline pt-4 text-[11px] leading-relaxed text-mist-dim">
          {DEMO_NOTICE} These groups and their member counts are invented.
        </p>
      )}
    </div>
  );
}
