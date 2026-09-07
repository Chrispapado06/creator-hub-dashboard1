import { Play, Mountain, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * FIVE START BUTTONS, SIDE BY SIDE — a picking screen, not a feature.
 *
 * The owner, 2026-09-06: "make me 5 designs on the start activity button and
 * present it to me".
 *
 * ── THIS SCREEN IS DEV-ONLY AND MUST STAY THAT WAY ───────────────────────────
 *
 * It is routed behind `import.meta.env.DEV`, so it exists on a dev server and
 * in no built bundle — not production, not the shared preview. It is a
 * workbench: once a design is chosen, the winner moves into `TabBar` and this
 * file is deleted. It is not a settings page and there is nothing here to
 * ship.
 *
 * Each variant is drawn in a REAL PILL, at the real size, over a real
 * photograph — a Start button judged on a plain background is judged on the one
 * surface it never appears on, and the whole difficulty of this control is that
 * it sits on glass over whatever the page happens to be.
 */

const VARIANTS = [
  {
    id: 1,
    name: "Current — filled disc",
    note: "What ships today. A solid azure circle punched through the pill by an obsidian ring, with a glow beneath it.",
  },
  {
    id: 2,
    name: "Ringed",
    note: "The same disc, but the punch-through ring is drawn in azure rather than left invisible, so the button reads as set INTO the bar rather than floating over it.",
  },
  {
    id: 3,
    name: "Flush",
    note: "No lift at all. The disc sits inside the pill on the baseline of the other four tabs — quietest option, and the only one that never overlaps the page.",
  },
  {
    id: 4,
    name: "Wide pill",
    note: "A capsule with the word in it, not a circle. Reads as a command rather than an icon, and is the only variant that survives a screen reader without an aria-label.",
  },
  {
    id: 5,
    name: "Summit",
    note: "The mountain mark instead of the play triangle, on the same disc. The peak was ICEFALL's own mark on the old bar; this is where it could go back.",
  },
] as const;

export default function StartOptions() {
  return (
    <div className="no-scrollbar h-full overflow-y-auto px-5 pb-10 pt-6">
      <h1 className="text-[22px] font-light text-snow">Start button — five options</h1>
      <p className="mt-1 text-[12.5px] leading-relaxed text-mist">
        Dev-only screen. Each is drawn at real size in a real pill over a photograph, because that
        is the only place this control ever appears.
      </p>

      {VARIANTS.map((v) => (
        <section key={v.id} className="pt-9">
          <p className="section-label text-azure">
            {v.id} · {v.name}
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-mist">{v.note}</p>
          <Stage>
            <StartVariant id={v.id} />
          </Stage>
        </section>
      ))}
    </div>
  );
}

/** A real pill, over a real photograph, at the real size. */
function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mt-4 overflow-hidden rounded-[18px]">
      <img
        src="/img/community-b.jpg"
        alt=""
        aria-hidden
        className="h-[132px] w-full object-cover"
        style={{ objectPosition: "50% 70%" }}
      />
      <div className="absolute inset-x-3 bottom-3">
        <div className="relative overflow-visible rounded-[24px] border border-hairline-strong bg-[color-mix(in_oklab,var(--ice-graphite)_24%,transparent)] backdrop-blur-2xl backdrop-saturate-150">
          <ul className="relative flex h-[52px] items-stretch">
            <Tab label="Home" />
            <Tab label="Explore" />
            <li className="relative flex-1">{children}</li>
            <Tab label="Coach" />
            <Tab label="Social" />
          </ul>
        </div>
      </div>
    </div>
  );
}

function Tab({ label }: { label: string }) {
  return (
    <li className="flex flex-1 flex-col items-center justify-center gap-[3px]">
      <span aria-hidden className="h-[21px] w-[21px] rounded-md border border-mist/40" />
      <span className="text-[10.5px] leading-none text-mist">{label}</span>
    </li>
  );
}

function StartVariant({ id }: { id: number }) {
  /* 1 — what ships today. */
  if (id === 1) {
    return (
      <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[19px]">
        <span className="grid h-[56px] w-[56px] place-items-center rounded-full bg-obsidian">
          <span className="grid h-[48px] w-[48px] place-items-center rounded-full bg-[linear-gradient(to_bottom,var(--ice-start-from),var(--ice-start-to))] text-[color:var(--ice-on-accent)] shadow-[0_8px_28px_-6px_var(--ice-azure-glow)]">
            <Play size={18} strokeWidth={2} className="ml-0.5" fill="currentColor" />
          </span>
        </span>
        <span className="absolute inset-x-0 -bottom-[15px] text-center text-[10.5px] font-medium leading-none text-azure">
          Start
        </span>
      </span>
    );
  }

  /* 2 — the ring is drawn, not punched. */
  if (id === 2) {
    return (
      <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[19px]">
        <span className="grid h-[56px] w-[56px] place-items-center rounded-full border border-azure/45 bg-obsidian/70 backdrop-blur">
          <span className="grid h-[44px] w-[44px] place-items-center rounded-full bg-[linear-gradient(to_bottom,var(--ice-start-from),var(--ice-start-to))] text-[color:var(--ice-on-accent)]">
            <Play size={17} strokeWidth={2} className="ml-0.5" fill="currentColor" />
          </span>
        </span>
        <span className="absolute inset-x-0 -bottom-[15px] text-center text-[10.5px] font-medium leading-none text-azure">
          Start
        </span>
      </span>
    );
  }

  /* 3 — flush, inside the bar. */
  if (id === 3) {
    return (
      <span className="flex h-full flex-col items-center justify-center gap-[3px]">
        <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-azure text-obsidian">
          <Play size={14} strokeWidth={2} className="ml-0.5" fill="currentColor" />
        </span>
        <span className="text-[10.5px] font-medium leading-none text-azure">Start</span>
      </span>
    );
  }

  /* 4 — a capsule with the word in it. */
  if (id === 4) {
    return (
      <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[14px]">
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full px-4 py-2.5",
            "bg-[linear-gradient(to_bottom,var(--ice-start-from),var(--ice-start-to))]",
            "text-[13px] font-semibold text-[color:var(--ice-on-accent)]",
            "shadow-[0_8px_28px_-6px_var(--ice-azure-glow)]",
          )}
        >
          <Play size={13} strokeWidth={2} fill="currentColor" />
          Start
          <ChevronRight size={13} strokeWidth={2.2} className="-mr-1 opacity-70" />
        </span>
      </span>
    );
  }

  /* 5 — the summit mark instead of the triangle. */
  return (
    <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[19px]">
      <span className="grid h-[56px] w-[56px] place-items-center rounded-full bg-obsidian">
        <span className="grid h-[48px] w-[48px] place-items-center rounded-full bg-[linear-gradient(to_bottom,var(--ice-start-from),var(--ice-start-to))] text-[color:var(--ice-on-accent)] shadow-[0_8px_28px_-6px_var(--ice-azure-glow)]">
          <Mountain size={20} strokeWidth={2.1} />
        </span>
      </span>
      <span className="absolute inset-x-0 -bottom-[15px] text-center text-[10.5px] font-medium leading-none text-azure">
        Start
      </span>
    </span>
  );
}
