import { useState } from "react";
import { peakImage } from "./peakPlate";
import { Link } from "react-router-dom";
import { Bookmark, CalendarDays, MapPin, Mountain, RotateCcw, X } from "lucide-react";
import { Badge, Button, GuidePhoto, Rating, VerifiedTick } from "@/components/ui";
import { GuideCredentialMark } from "@/components/marks";
import { DEMO_NOTICE, EXPEDITIONS, GUIDES, IS_DEMO } from "@/data/demo";
import { formatEur } from "@/money/model";
import { cn } from "@/lib/utils";

/**
 * Saved — the bookmarked expeditions and guides.
 *
 * ── THERE IS NOTHING BEHIND THE BOOKMARK ────────────────────────────────────
 *
 * A saved list is the one screen where it is easiest to imply an account exists:
 * it looks like a server remembered something for you. Nothing did. The demo set
 * is `EXPEDITIONS` and `GUIDES` gated on `IS_DEMO`; removing an item edits React
 * state in this tab and a reload brings the whole set back. A production build
 * has no listings to save, so it renders a one-line empty state.
 *
 * Honesty used to be paragraphs on this page — five of them, repeating that
 * there is no server, no booking, no account, and that ratings are invented.
 * That reasoning now lives here in comments, and the UI carries it as labels:
 *   • "From · indicative" / "Day rate · indicative" on every price — no
 *     expedition is quoted or charged through ICEFALL; a price is the start of
 *     a conversation, never a checkout.
 *   • "Demo set · this tab only" beside Restore — the remove button is local
 *     React state, so nothing is deleted anywhere and a reload restores it.
 *   • The ratings and review counts are invented. No booking has ever happened
 *     through ICEFALL, so no client could have left one. DEMO_NOTICE at the
 *     foot says this once for the whole page, which is the entire text budget.
 *   • A verified tick means only that documents were read on the date it gives.
 *
 * Signed-in state is deliberately NOT read here. The session lives in this
 * browser, holds a name and an email, and has never been sent anywhere — so it
 * changes nothing about what this page can show, and saying so was one of the
 * paragraphs that had to go.
 *
 * The saved state and the remove control are deliberately two different things:
 * a filled bookmark says "this is kept", the ✕ takes it out. One glyph doing
 * both means the icon you are reading is also the button you are about to press.
 */

type SavedExpedition = (typeof EXPEDITIONS)[number];
type SavedGuide = (typeof GUIDES)[number];
type Tab = "all" | "expeditions" | "guides";

export default function Saved() {
  // One set for both lists — guide and expedition ids share no prefix.
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
  // A segmented control instead of one long scroll: the counts sit above the
  // fold and either list can be read on its own.
  const [tab, setTab] = useState<Tab>("all");

  const remove = (id: string) =>
    setRemoved((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  const restore = () => setRemoved(new Set());

  const expeditions = EXPEDITIONS.filter((e) => !removed.has(e.id));
  const guides = GUIDES.filter((g) => !removed.has(g.id));
  const total = expeditions.length + guides.length;

  const showExpeditions = tab !== "guides";
  const showGuides = tab !== "expeditions";

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-light tracking-[-0.02em] text-snow">Saved</h1>
          <p className="mt-1.5 text-[13px] text-mist">Objectives to come back to, and the guides who run them.</p>
        </div>
        <span className="tnum text-[11.5px] text-mist-dim">
          {IS_DEMO ? `${total} saved` : "None yet"}
        </span>
      </div>

      {!IS_DEMO && (
        // Production build: no company and no guide has been listed yet, so
        // there is nothing to bookmark. One line, then a way out.
        <section className="mt-8 max-w-[560px] rounded-card border border-hairline bg-graphite p-6">
          <Bookmark size={20} strokeWidth={1.6} aria-hidden className="text-mist-dim" />
          <h2 className="mt-3 text-[15px] text-snow">Nothing saved</h2>
          <p className="mt-2 text-[13px] text-mist">No companies or guides are listed yet.</p>
          <Link
            to="/app/explore"
            className="mt-5 inline-flex items-center gap-2 rounded-tile border border-azure/45 px-4 py-2.5 text-[12.5px] text-azure transition-colors hover:bg-azure/10"
          >
            Go to Explore
          </Link>
        </section>
      )}

      {IS_DEMO && (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
            <Segmented
              tab={tab}
              onChange={setTab}
              counts={{ all: total, expeditions: expeditions.length, guides: guides.length }}
            />
            <div className="flex items-center gap-3">
              <span className="text-[10.5px] text-mist-dim">Demo set · this tab only</span>
              {removed.size > 0 && (
                <button
                  type="button"
                  onClick={restore}
                  className="inline-flex items-center gap-1.5 text-[11.5px] text-azure transition-colors hover:text-azure-bright"
                >
                  <RotateCcw size={12.5} strokeWidth={1.9} />
                  Restore
                </button>
              )}
            </div>
          </div>

          {showExpeditions && (
            <section>
              <SectionHead title="Expeditions" count={expeditions.length} meta="Prices indicative" />
              {expeditions.length === 0 ? (
                <EmptyRow onRestore={removed.size > 0 ? restore : undefined} />
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {expeditions.map((e) => (
                    <ExpeditionCard key={e.id} expedition={e} onRemove={() => remove(e.id)} />
                  ))}
                </div>
              )}
            </section>
          )}

          {showGuides && (
            <section>
              <SectionHead title="Guides" count={guides.length} meta="Rates and ratings invented" />
              {guides.length === 0 ? (
                <EmptyRow onRestore={removed.size > 0 ? restore : undefined} />
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {guides.map((g) => (
                    <GuideCard key={g.id} guide={g} onRemove={() => remove(g.id)} />
                  ))}
                </div>
              )}
            </section>
          )}

          <p className="mt-10 border-l-2 border-azure/30 pl-4 text-[11px] leading-relaxed text-mist-dim">
            {DEMO_NOTICE}
          </p>
        </>
      )}
    </div>
  );
}

function Segmented({
  tab,
  onChange,
  counts,
}: {
  tab: Tab;
  onChange: (next: Tab) => void;
  counts: Record<Tab, number>;
}) {
  const items: { id: Tab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "expeditions", label: "Expeditions" },
    { id: "guides", label: "Guides" },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-pill border border-hairline bg-graphite p-1">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          aria-pressed={tab === item.id}
          className={cn(
            "rounded-pill px-3.5 py-1.5 text-[12px] transition-colors",
            tab === item.id ? "bg-elevated text-snow" : "text-mist hover:text-snow",
          )}
        >
          {item.label}
          <span className="tnum ml-1.5 text-[10.5px] text-mist-dim">{counts[item.id]}</span>
        </button>
      ))}
    </div>
  );
}

function SectionHead({ title, count, meta }: { title: string; count: number; meta: string }) {
  return (
    <div className="mt-9 flex items-baseline justify-between gap-4 border-b border-hairline pb-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[15px] text-snow">{title}</h2>
        <span className="tnum text-[11.5px] text-mist-dim">{count}</span>
      </div>
      <span className="text-[10.5px] text-mist-dim">{meta}</span>
    </div>
  );
}

/** Empty list: a label, not an explanation. Nothing was deleted anywhere. */
function EmptyRow({ onRestore }: { onRestore?: () => void }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-4 rounded-card border border-hairline bg-graphite px-5 py-6">
      <span className="text-[13px] text-mist">None yet</span>
      {onRestore !== undefined && (
        <Button variant="secondary" size="sm" onClick={onRestore}>
          <RotateCcw size={14} strokeWidth={1.8} />
          Restore demo set
        </Button>
      )}
    </div>
  );
}

/** The state, not the control. Filled azure bookmark = this is kept. */
function SavedChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong px-2.5 py-1 text-[10.5px] text-mist",
        className,
      )}
    >
      <Bookmark size={11} strokeWidth={1.6} fill="currentColor" aria-hidden className="text-azure" />
      Saved
    </span>
  );
}

function RemoveButton({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-7 w-7 shrink-0 place-items-center rounded-full border border-hairline-strong text-mist transition-colors hover:border-hairline-strong hover:bg-elevated hover:text-snow",
        className,
      )}
    >
      <X size={13} strokeWidth={1.9} />
    </button>
  );
}

function ExpeditionCard({
  expedition: e,
  onRemove,
}: {
  expedition: SavedExpedition;
  onRemove: () => void;
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-card border border-hairline bg-graphite transition-colors hover:border-hairline-strong">
      <div className="relative aspect-[16/10]">
        <img
          src={peakImage(e.heroPeak)}
          alt=""
          aria-hidden
          className="h-full w-full object-cover"
        />
        <div aria-hidden className="scrim-bottom absolute inset-x-0 bottom-0 h-2/3" />
        <SavedChip className="absolute left-3 top-3 bg-obsidian/70 backdrop-blur-sm" />
        <RemoveButton
          label={`Remove ${e.objective} from saved`}
          onClick={onRemove}
          className="absolute right-3 top-3 bg-obsidian/70 backdrop-blur-sm"
        />
        <div className="absolute inset-x-4 bottom-3.5">
          <p className="text-[15px] leading-snug text-snow">{e.objective}</p>
          <span className="mt-1 flex items-center gap-1.5 text-[11.5px] text-mist">
            {e.company}
            <VerifiedTick verifiedOn={e.verifiedOn} size={13} />
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-mist">
          <span className="flex items-center gap-1.5">
            <MapPin size={12.5} strokeWidth={1.8} className="text-azure" aria-hidden />
            {e.country}
          </span>
          <span className="flex items-center gap-1.5">
            <CalendarDays size={12.5} strokeWidth={1.8} className="text-azure" aria-hidden />
            {e.months}
          </span>
          <span className="tnum flex items-center gap-1.5">
            <Mountain size={12.5} strokeWidth={1.8} className="text-azure" aria-hidden />
            {e.durationDays} days
          </span>
        </div>

        <p className="clamp-2 mt-3 text-[11.5px] leading-relaxed text-mist-dim">{e.requires}</p>

        <div className="mt-auto flex items-end justify-between border-t border-hairline pt-3.5">
          <span>
            <span className="block text-[10px] text-mist-dim">From · indicative</span>
            <span className="tnum block text-[14px] text-snow">{formatEur(e.fromEur)}</span>
          </span>
          <Link
            to="/app/explore"
            className="text-[11.5px] text-azure transition-colors hover:text-azure-bright"
          >
            View expedition
          </Link>
        </div>
      </div>
    </article>
  );
}

function GuideCard({ guide: g, onRemove }: { guide: SavedGuide; onRemove: () => void }) {
  return (
    <article className="flex flex-col rounded-card border border-hairline bg-graphite p-5 transition-colors hover:border-hairline-strong">
      <div className="flex items-start gap-3.5">
        <GuidePhoto name={g.name} src={g.photo} size={46} />
        <div className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[14.5px] text-snow">{g.name}</span>
            <GuideCredentialMark verifiedOn={g.verifiedOn} size={14} />
          </span>
          <p className="mt-0.5 truncate text-[11.5px] text-mist-dim">{g.credential}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-mist">
            <MapPin size={12} strokeWidth={1.8} className="text-azure" aria-hidden />
            {g.basedIn}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          <SavedChip />
          <RemoveButton label={`Remove ${g.name} from saved`} onClick={onRemove} />
        </span>
      </div>

      <p className="clamp-2 mt-4 text-[12.5px] leading-relaxed text-mist">{g.headline}</p>

      <div className="mt-3.5 flex flex-wrap gap-1.5">
        {g.mountains.map((m) => (
          <Badge key={m}>{m}</Badge>
        ))}
      </div>

      <p className="tnum mt-3.5 text-[11px] text-mist-dim">
        {g.yearsGuiding} years guiding · {g.languages.join(", ")}
      </p>

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-hairline pt-3.5">
        <span>
          <span className="block text-[10px] text-mist-dim">Day rate · indicative</span>
          <span className="tnum block text-[14px] text-snow">{formatEur(g.dayRate)}</span>
        </span>
        <Rating value={g.rating} reviews={g.reviews} />
      </div>
    </article>
  );
}
