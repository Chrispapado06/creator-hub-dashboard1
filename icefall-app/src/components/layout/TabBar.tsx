import { Compass, House, MessageCircle, Play, Users } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Primary navigation.
 *
 * Starting an activity is the single most important action in the app, so it
 * sits dead centre as a raised control rather than competing as one tab among
 * five. Activity history is still one tap away from Home and Profile — the
 * centre button is the *doing*, the history is the *looking back*.
 */
const TABS = [
  { to: "/home", label: "Home", icon: House },
  { to: "/explore", label: "Explore", icon: Compass },
  null, // centre slot — the start control
  { to: "/coach", label: "Coach", icon: MessageCircle },
  /*
     SOCIAL TAKES THE PROFILE SLOT, at the owner's request (2026-09-03).

     The profile did not lose its door, it changed door: the avatar at the top
     of Home is now the way in, which is where a person looks for themselves
     anyway. Trading a bottom-bar slot for a feed is the right trade because a
     feed is somewhere you GO REPEATEDLY and a profile is somewhere you go to
     change something.

     IT POINTS AT `/social`, A DESTINATION OF ITS OWN. It used to point at
     `/explore/social`, and the screen rendered inside `ExploreLayout` — so this
     tab produced a screen titled "Explore", with a back chevron and the Explore
     tab row stacked above Social's own. The owner, 2026-09-03: "when you click
     on social, i dont want it to be shown on explore anymore."

     The reason it had been left under Explore is worth keeping: that layout
     owned the create-group + in its header, and it is the only way to make a
     group. The + moved to Social's own header with the screen rather than being
     left behind. `/explore/social` still redirects here, query string intact.
  */
  { to: "/social", label: "Social", icon: Users },
] as const;

/* -------------------------------------------------------------------------- */
/* The summit line — REMOVED 2026-09-06, and worth saying why                  */
/* -------------------------------------------------------------------------- */

/*
 * A `SummitEdge` used to live here: the bar's top edge rose into a small azure
 * mountain above whichever tab you were on, with short accent shoulders either
 * side, sliding between slots on a spring. It was measured off the owner's own
 * reference drawing and it was the most ICEFALL thing in the navigation.
 *
 * IT DID NOT SURVIVE THE MOVE TO A FLOATING PILL, and the owner's verdict on
 * seeing the two bars side by side was "design is really bad, look and
 * compare". Three reasons, in order of how much they mattered:
 *
 *   1. The mark was drawn ON A CONTINUOUS TOP EDGE. It worked because the bar
 *      ran the full width of the screen and its edge read as a horizon. The
 *      pill has no horizon — it has a border that turns a corner — and an
 *      opaque summit punched through that border, so the pill looked broken
 *      exactly where the mark was.
 *   2. It became the SECOND indicator. The lozenge below marks the active tab,
 *      which is what the reference does, and two markers for one selection is
 *      one more than the eye can follow — the same reason the `layoutId`
 *      underline was removed when the summit arrived.
 *   3. On the Social screen it landed under the floating + button and read as a
 *      stray blue line crossing it.
 *
 * The whole component, its measured geometry (`PEAK_HALF` 18, `PEAK_RISE` 12,
 * `PEAK_SHOULDER` 14) and its `ResizeObserver` are in git, one commit before
 * this one. It is a deletion rather than a flag because a mountain drawn on a
 * shape that has no horizon is not a setting, it is a different design.
 */

/* -------------------------------------------------------------------------- */
/* The light over the selected tab                                             */
/* -------------------------------------------------------------------------- */

/**
 * A LAMP ABOVE THE TAB YOU ARE ON — the owner's mockup, 2026-09-06: "add like
 * the mockup the light above selected page 1:1 on the one you select".
 *
 * Three pieces, and it only reads as light when all three are present:
 *
 *   THE EMITTER — a short, bright, rounded bar sitting ON the pill's top edge.
 *   It is the source, so it is the only pure white in the bar and it carries a
 *   glow of its own rather than a border.
 *
 *   THE CONE — a trapezoid widening downward from the emitter, filled with a
 *   white gradient that fades out before it reaches the bottom of the pill.
 *   Widening is what makes it read as light rather than as an underline: a
 *   rectangle of the same gradient reads as a highlighted column.
 *
 *   THE POOL — a soft radial smudge where the cone lands, so the light appears
 *   to fall ON something. Without it the cone stops in mid-air.
 *
 * WHAT THIS REPLACED. A filled capsule behind the active tab, which was the
 * previous reference's marker. It went in the same change: two indicators for
 * one selection is one more than the eye can follow, and the owner's mockup has
 * no capsule.
 *
 * ONE MOTION VALUE for all three pieces, so they cannot drift apart. The
 * removed summit mark shared its value with the lozenge for the same reason:
 * two springs targeting one slot agree only by coincidence, and the coincidence
 * fails on the frame a rotate lands.
 *
 * IT IS `aria-hidden`. The current tab is already announced — the `Link`
 * carries `aria-current="page"` — and a light that also claimed to be the
 * selection would be the second announcement of one fact.
 */
/**
 * NARROWER THAN THE MOCKUP'S, and the reason is the corners.
 *
 * The light is clipped to the pill, so on the first and last tab a wide cone
 * loses whatever falls outside the rounded corner and the beam reads as cut in
 * half — the owner, 2026-09-06: "make the light white slightly smaller in size
 * so if its on corners pages still looks good". At 42 the emitter and its cone
 * both sit inside the straight part of the top edge at every slot on a 375pt
 * screen, so all five look like the same lamp.
 */
const BEAM_W = 42;

/**
 * THE LIGHT IS THE THEME'S OWN INK, not white — and this is not pedantry, the
 * light theme is where it showed.
 *
 * The mockup is a dark design and the beam in it is white. Shipped as literal
 * white, the whole effect vanished under `data-theme="light"`: a white lamp on
 * a pane that is itself near-white left the active tab marked by nothing at all.
 *
 * `--ice-snow` is the app's primary INK token, so it is near-white on the dark
 * canvas and near-black on the light one — and the pane under it is `graphite`,
 * which flips the same way. Taking the light from that token means the beam is
 * always the opposite of the glass it falls on, in both themes, without a
 * single conditional. In the light theme it reads as a shadow cast down rather
 * than a lamp shining down, which is the honest translation of the idea.
 */
const LIGHT = "var(--ice-snow)";
const lit = (alpha: number) =>
  `color-mix(in oklab, var(--ice-snow) ${Math.round(alpha * 100)}%, transparent)`;

function ActiveLight({ index, width }: { index: number | null; width: number }) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const placed = useRef(false);

  const slot = width === 0 ? 0 : width / 5;
  const centre = index === null || width === 0 ? null : index * slot + slot / 2;

  useEffect(() => {
    if (centre === null) return;
    const left = centre - BEAM_W / 2;
    if (!placed.current || reduce) {
      placed.current = true;
      x.set(left);
      return;
    }
    const controls = animate(x, left, { type: "spring", stiffness: 420, damping: 38, mass: 0.7 });
    return () => controls.stop();
  }, [centre, reduce, x]);

  if (centre === null) return null;

  return (
    <motion.span
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 h-full"
      style={{ x, width: BEAM_W }}
    >
      {/* The cone. Clipped from a box twice the emitter's width so it can widen
          past it, and `overflow-hidden` on the wrapper below keeps it inside
          the pill's rounded corners. */}
      <span
        className="absolute left-1/2 top-0 h-[44px] -translate-x-1/2"
        style={{
          width: BEAM_W * 1.85,
          background: `linear-gradient(to bottom, ${lit(0.34)} 0%, ${lit(0.13)} 42%, ${lit(0)} 100%)`,
          clipPath: `polygon(${50 - (BEAM_W / (BEAM_W * 1.85)) * 50}% 0%, ${50 + (BEAM_W / (BEAM_W * 1.85)) * 50}% 0%, 100% 100%, 0% 100%)`,
        }}
      />

      {/* The pool of light where the cone lands. */}
      <span
        className="absolute left-1/2 top-[20px] h-12 w-[86px] -translate-x-1/2"
        style={{
          background: `radial-gradient(closest-side, ${lit(0.16)} 0%, ${lit(0)} 100%)`,
        }}
      />

      {/* The emitter, on the pill's own edge. `-top-[2px]` sits it half over
          the border so the bar looks like it is set INTO the rim rather than
          resting on top of it. */}
      <span
        className="absolute -top-[2px] left-1/2 h-[4px] -translate-x-1/2 rounded-full"
        style={{
          width: BEAM_W,
          backgroundColor: LIGHT,
          boxShadow: `0 0 11px 1px ${lit(0.8)}`,
        }}
      />
    </motion.span>
  );
}

/* -------------------------------------------------------------------------- */
/* The tap ripple                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The circle that spreads from where the finger landed.
 *
 * Measured off the owner's recording: tapping a tab in AllTrails grows a soft
 * ring out of the icon over roughly half a second and fades it. It is the part
 * of the reference that makes the bar feel answered rather than merely
 * repainted, and it is the one thing here that is purely feedback — it says
 * "that tap registered" in the moment before the screen cross-fades.
 *
 * IT IS NOT A LOADING INDICATOR. It fires on pointer-down and ends on its own
 * schedule, so it must never be read as "the page is coming" — the cross-fade
 * in `AppShell` is what shows that, and it starts on its own.
 *
 * SUPPRESSED UNDER `prefers-reduced-motion`, along with everything else here.
 */
function Ripple({ at }: { at: { x: number; y: number; key: number } | null }) {
  const reduce = useReducedMotion();
  if (!at || reduce) return null;

  return (
    <motion.span
      key={at.key}
      aria-hidden="true"
      initial={{ opacity: 0.5, scale: 0 }}
      animate={{ opacity: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-none absolute rounded-full bg-[color-mix(in_oklab,var(--ice-azure)_45%,transparent)]"
      /* Sized in the style so one span serves every slot width; centred on the
         tap by pulling back half its own box. */
      style={{ left: at.x - 54, top: at.y - 54, width: 108, height: 108 }}
    />
  );
}

/** One predicate, so the peak and the highlight cannot land on different tabs. */
/*
 * LONGEST MATCH WINS.
 *
 * Written when the bar held two nested destinations, `/explore` and
 * `/explore/social`: a plain prefix test lit BOTH on `/explore/social`, because
 * the more specific tab is also a prefix of itself and the less specific one
 * had no idea it had been outranked. NO TWO TABS NEST TODAY — Social moved to
 * `/social` — so nothing currently depends on this. It is kept because the
 * ambiguity comes back the moment anybody files a fifth destination under an
 * existing one, and because it is what keeps `/social/post/:id` lighting Social
 * rather than nothing.
 *
 * A tab is active when it prefix-matches AND no other tab matches with a longer
 * `to`. One computation, one winner.
 */
function matchLength(pathname: string, to: string): number {
  return pathname === to || pathname.startsWith(`${to}/`) ? to.length : -1;
}

function activeTabPath(pathname: string): string | null {
  let best: string | null = null;
  let bestLen = -1;
  for (const t of TABS) {
    if (!t) continue;
    const len = matchLength(pathname, t.to);
    if (len > bestLen) {
      bestLen = len;
      best = t.to;
    }
  }
  return best;
}

export function TabBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  /*
   * Which of the five slots the peak belongs over — the index in TABS, because
   * the centre slot occupies a position too and the arithmetic counts all five.
   *
   * `null` on a route no tab owns (recording an activity, say). The peak then
   * has nowhere honest to point, so the edge draws as a plain horizon rather
   * than parking over whichever tab happened to be last.
   */
  const activeIndex = ((): number | null => {
    const winner = activeTabPath(pathname);
    const i = TABS.findIndex((t) => t !== null && t.to === winner);
    return i === -1 ? null : i;
  })();

  /*
   * ONE MEASUREMENT, SHARED. The peak and the lozenge both need the slot
   * geometry, and two observers on one element is how they end up a frame apart
   * on a rotate. This measures the PILL, which is what the slots divide.
   */
  const pill = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  /*
   * WHERE THE LAST TAP LANDED, in the pill's own coordinates, plus a key so a
   * second tap on the same spot restarts the animation instead of being treated
   * as the same one. Cleared after the ripple's own duration so a stale circle
   * cannot reappear when the bar re-renders for an unrelated reason.
   */
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null);
  const rippleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(rippleTimer.current), []);

  const strike = (e: ReactPointerEvent<HTMLElement>) => {
    const box = pill.current?.getBoundingClientRect();
    if (!box) return;
    setRipple({ x: e.clientX - box.left, y: e.clientY - box.top, key: Date.now() });
    clearTimeout(rippleTimer.current);
    rippleTimer.current = setTimeout(() => setRipple(null), 600);
  };
  useEffect(() => {
    const el = pill.current;
    if (!el) return;
    const read = () => setWidth(el.getBoundingClientRect().width);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    window.addEventListener("resize", read);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", read);
    };
  }, []);

  return (
    <nav
      /*
       * A FLOATING PILL, not a bar across the bottom — the owner's reference is
       * AllTrails, 2026-09-06, and this is its shape: inset from both edges,
       * lifted off the bottom, rounded all the way round.
       *
       * THE NAV IS STILL IN FLOW, and that is deliberate. It is `shrink-0` in
       * the shell's flex column exactly as the full-width bar was. Making it
       * `fixed` would take its height out of the layout entirely, and NINETEEN
       * screens in this app run their own scroller rather than `Screen` — every
       * one of them would need its own bottom padding, found by hand, and the
       * ones that were missed would hide their last row under the bar.
       *
       * `-mt-6` IS WHAT MAKES THE GLASS REAL. A translucent pane with the app's
       * own canvas behind it is just a flat colour — `backdrop-blur` needs
       * something to blur. So the nav is pulled 24px up into the content above
       * it, the page scrolls underneath the top of the pill, and `Screen`'s
       * bottom spacer grew by the same 24px so nothing is hidden by it. Small
       * enough that the custom scrollers, which all carry `pb-8` or more, need
       * no change.
       */
      className="relative z-20 -mt-6 shrink-0 bg-transparent px-4 pb-2"
      /*
       * LIFTED OFF THE BOTTOM (owner, 2026-09-06: "add the navigation now
       * slightly more above from where it is, not completely at the bottom").
       *
       * 8px → 18px → 30px above the safe-area inset. The gap is what makes the pill
       * read as floating over the page rather than as a bar fixed to the edge
       * of the screen — with no gap, the rounded bottom corners have nothing to
       * be rounded against.
       *
       * It is ADDED to the inset, never instead of it: on a device with a home
       * indicator the inset is what keeps the pill clear of the gesture bar,
       * and replacing it with a fixed number puts the last row of tabs under
       * the place the system swipes from.
       */
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 30px)" }}
      aria-label="Primary"
    >
      <div
        ref={pill}
        /*
         * `overflow-visible` is load-bearing twice over: the raised Start
         * control and the summit peak both stand proud of this box, and
         * clipping either is the whole design gone.
         */
        /*
         * GLASS. The owner, 2026-09-06: "make the background transparent,
         * basically glass looking".
         *
         * Three things together, and none of them works alone: a background
         * that is mostly NOT there, a heavy `backdrop-blur` to turn what shows
         * through into a wash rather than legible content, and a hairline that
         * catches the edge so the pane has a shape. The `saturate` is what
         * stops the blurred content going grey — it is what makes it read as
         * glass rather than as fog.
         *
         * 58% → 38% → 24%, on the owner's eye, 2026-09-06. This is the number
         * to move if it ever needs tuning again.
         *
         * 24% IS AT THE FLOOR AND SHOULD NOT GO LOWER without changing
         * something else. The pane is now doing very little of the work and the
         * `backdrop-blur-2xl` is doing nearly all of it: over a dark page it
         * reads beautifully, and over a bright photograph the labels are close
         * to the edge of legible. If it needs to be more transparent still, the
         * fix is a bottom scrim under the pill, not less fill in it — a
         * navigation that cannot be read over a hero image is not a trade worth
         * making for a nicer pane.
         */
        className="relative overflow-visible rounded-[24px] border border-hairline-strong bg-[color-mix(in_oklab,var(--ice-graphite)_24%,transparent)] shadow-[var(--ice-shadow-pop)] backdrop-blur-2xl backdrop-saturate-150"
      >
        {/* Both the light and the ripple are clipped to the pill, so the cone
            and the circle respect its rounded corners — the wrapper owns the
            rounding, not the shapes inside it. The emitter is INSIDE this clip
            too, which is why it sits at `-top-[2px]` rather than further out:
            anything above the edge would be cut. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[24px]"
        >
          <ActiveLight index={activeIndex} width={width} />
          <Ripple at={ripple} />
        </span>

        <ul className="relative flex h-[var(--tabbar-h)] items-stretch">
        {TABS.map((tab, i) => {
          if (!tab) {
            return (
              <li key="start" className="relative flex-1">
                <button
                  type="button"
                  onPointerDown={strike}
                  onClick={() => navigate("/activity/select")}
                  aria-label="Start an activity"
                  className="group absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[9px]"
                >
                  {/* Obsidian ring punches the button through the bar. */}
                  <span className="grid h-[56px] w-[56px] place-items-center rounded-full bg-obsidian">
                    <span
                      className={cn(
                        /* Named tokens, not `text-snow` and not the azure pair.
                           `snow` is the primary TEXT colour and only happens to
                           be white on a dark canvas — on a light one it is dark
                           ink, which turned the arrow black. See --ice-start-from
                           in index.css. */
                        "grid h-[48px] w-[48px] place-items-center rounded-full",
                        "text-[color:var(--ice-on-accent)]",
                        "bg-[linear-gradient(to_bottom,var(--ice-start-from),var(--ice-start-to))]",
                        "transition-all duration-200 ease-[cubic-bezier(.22,1,.36,1)]",
                        "group-active:scale-95",
                        // The glow is the control's whole presence in the bar.
                        "shadow-[0_8px_28px_-6px_var(--ice-azure-glow)]",
                      )}
                    >
                      <Play size={18} strokeWidth={2} className="ml-0.5" fill="currentColor" />
                    </span>
                  </span>
                  {/*
                    NO LABEL (owner, 2026-09-06: "remove the text start and take
                    button under"). The word sat under the disc and, with the
                    button lowered into the bar, it had nowhere to go that was
                    not either colliding with the pill's bottom edge or pushing
                    the disc back up.
                    
                    THE `aria-label` ON THE BUTTON IS NOW THE ONLY NAME THIS
                    CONTROL HAS, which makes it load-bearing rather than a
                    nicety: without it a screen reader announces "button" and
                    nothing else. It says "Start an activity" and must not be
                    removed with the visible text.
                  */}
                </button>
              </li>
            );
          }

          const active = tab.to === activeTabPath(pathname);
          const Icon = tab.icon;

          return (
            <li key={tab.to} className="flex-1">
              {/*
                A PLAIN `Link`, NOT `NavLink`, and the reason is the whole point
                of the matcher above. `NavLink` runs its OWN prefix matcher and
                stamps `aria-current="page"` from it — passing `undefined` does
                NOT switch that off, it falls through to the component's default.
                So the bar would carry two independent notions of "active", and
                the accessible one would not be ours: back when Social sat at
                `/explore/social`, a screen reader heard two current tabs while
                the eye saw one.

                `NavLink` also stamps a literal `active` class from a
                case-insensitive matcher. Nothing styles `.active` today, so it
                is inert — but the next person to write that rule would have no
                way to know it was already being applied.

                A `Link` has no opinion. One computation, one winner.
                (Found by the ICEFALL 001 variant, which hit it first.)
              */}
              <Link
                to={tab.to}
                onPointerDown={strike}
                className="group relative flex h-full flex-col items-center justify-center gap-[3px]"
                aria-current={active ? "page" : undefined}
              >
                {/* The old `layoutId` underline lived here. The summit line is
                    the indicator now, and two sliding markers for one selection
                    is one more than the eye can follow. */}
                {/*
                  TYPE AND COLOUR, MEASURED OFF THE REFERENCE — the owner put
                  the two bars side by side on 2026-09-06 and the difference was
                  not the shape, it was this.
                  
                  Ours was a 9px UPPERCASE label with 0.14em tracking under a
                  20px icon, and the active tab went azure. That reads as a
                  legend on a chart: small, wide, insistent. AllTrails runs a
                  ~13px sentence-case label under a ~24px icon, and the active
                  tab is simply WHITE — the lozenge behind it is what marks the
                  selection, so the colour does not have to.

                  So: sentence case, no tracking, bigger on both counts, and the
                  accent retired from this control. Azure is still in the bar —
                  on the Start button, which is an action, and on the summit
                  mark. Spending it on "which tab am I on" as well left nothing
                  to distinguish them.
                */}
                <Icon
                  size={21}
                  strokeWidth={active ? 1.8 : 1.5}
                  className={cn(
                    "transition-colors duration-200",
                    active ? "text-snow" : "text-mist group-hover:text-snow",
                  )}
                />
                <span
                  className={cn(
                    "text-[10.5px] leading-none transition-colors duration-200",
                    active ? "font-medium text-snow" : "text-mist group-hover:text-snow",
                  )}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
        </ul>
      </div>
    </nav>
  );
}
