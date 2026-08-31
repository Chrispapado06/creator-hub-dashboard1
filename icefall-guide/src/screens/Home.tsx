import { Link } from "react-router-dom";
import { ArrowRight, Bell, CalendarDays, ChevronRight, Menu } from "lucide-react";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { Card, Disclaimer, StatusPill } from "@/components/ui/primitives";
import { Notice } from "@/components/guide";
import { NotificationOptIn } from "@/components/NotificationOptIn";
import { PersonAvatar, Photo } from "@/components/Photo";
import { homeSummary } from "@/domain/season";
import { MOCKUP_FIGURES_NOTICE, SHOW_MOCKUP_FIGURES, reviewCount } from "@/domain/mockupFigures";
import { APPLICATION, DEMO_NOTICE, ME, fmtRange } from "@/data/demo";
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";
import { formatEur } from "@/money/model";
import { STATUS_COPY, effectiveStatus, expiringSoon, identityVerified } from "@/data/model";
import { StatusMarks } from "@/components/StatusBadge";
import { showsCredentialMark, useIdentity } from "@/domain/identity";
import { cn } from "@/lib/utils";

/**
 * HOME — built to the owner's second mockup (2026-08-30, the azure one).
 *
 * The mockup's own order, which is also the order a self-employed person cares
 * about: who am I, what has the season done, what is next, what is today.
 *
 * FOUR OF THE SIX OVERVIEW TILES ARE MEASURED and two are not. Bookings,
 * clients and earnings are counted from real rows; the rating and the summit
 * count have no possible source and are governed by `domain/mockupFigures.ts`
 * under the owner's tier-4 ruling, with the notice printed on screen. The
 * success-rate tile shows the honest sentence by default — see that file for
 * why that one is held back even in the sample view.
 *
 * The layout does not change between the two states: an unmeasured tile keeps
 * the space the number would have had and puts the reason in it, so a reader
 * scanning tiles cannot mistake an absence for a small number.
 */
export default function Home() {
  const { identity } = useIdentity();
  const s = homeSummary();
  const status = effectiveStatus(APPLICATION);
  const copy = STATUS_COPY[status];
  const soon = expiringSoon(APPLICATION);
  const next = s.upcoming[0];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  /** The short reasons any overview tile carries, joined into one line. */
  const footnotes = [
    ...new Set(
      [s.stats.successRate, s.stats.rating, s.stats.summits]
        .filter((r) => !r.available)
        .map((r) => (r as { reason: string }).reason),
    ),
    ...(SHOW_MOCKUP_FIGURES ? [MOCKUP_FIGURES_NOTICE] : []),
  ];

  /**
   * A REAL SESSION DISPLACES THE SAMPLE ENTIRELY. Signed in, this screen shows
   * that person — never the invented guide's name, bookings or credentials mark.
   * Their real figures arrive with S1 and the listing sync; until then the
   * honest states already written for an empty account are what they see.
   */
  if (identity.mode === "session") {
    return (
      <Screen>
        <Stagger>
          <Rise className="flex items-center justify-between pt-6">
            <span />
            <Link to="/profile" aria-label="Profile" className="text-mist">
              <Bell size={20} strokeWidth={1.6} />
            </Link>
          </Rise>

          <Rise className="pb-1 pt-5">
            <p className="text-[13px] text-mist">{greeting},</p>
            <h1 className="mt-1 flex items-center gap-1.5 text-[22px] font-light leading-tight text-snow">
              <span className="truncate">{identity.label}</span>
              <StatusMarks
                credentials={showsCredentialMark(identity, false)}
                /* `false` is the truth today: no server source for the identity
                   mark exists. Migration 20260831160000 (written, awaiting push)
                   adds `profiles?select=*,identity_verified` — a computed field,
                   derived never stored. THIS is a reader on that push's
                   displacement list; bind it there and nowhere else. */
                identity={false}
              />
            </h1>
            <p className="mt-1 text-[12px] text-mist-dim">
              {identity.isGuide ? "Guide account" : "Not a guide account"}
            </p>
          </Rise>

          {!identity.isGuide ? (
            <Rise className="pt-5">
              <Notice tone="alert">
                <p className="text-snow">This app is for guides</p>
                <p className="mt-1.5">
                  Your ICEFALL account is not a guide account. Nothing is wrong with it — every
                  account starts as a climber's, and it becomes a guide's when a member of our
                  staff has read your qualifications.
                </p>
              </Notice>
            </Rise>
          ) : (
            <Rise className="pt-5">
              <Card>
                <p className="text-[12.5px] leading-relaxed text-mist">
                  {identity.credentialsUnreadable
                    ? "ICEFALL could not read your verification just now. That is our side, not yours."
                    : identity.credentials === "checked"
                      ? "Your documents are checked and your listing can be shown."
                      : identity.credentials === "expired"
                        ? "The document behind your check has expired, so your listing is hidden until you send a current one."
                        : "ICEFALL has not checked your documents yet."}
                </p>
                <Link
                  to="/verification"
                  className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-azure"
                >
                  Open verification <ArrowRight size={13} strokeWidth={1.8} />
                </Link>
              </Card>
            </Rise>
          )}

          <Rise className="pt-6">
            <Card>
              <p className="text-[12.5px] leading-relaxed text-mist-dim">
                Your bookings, clients and earnings are not connected to this account yet. Nothing
                below is being hidden from you — there is nothing recorded against it.
              </p>
            </Card>
          </Rise>
        </Stagger>
      </Screen>
    );
  }

  if (!ME) {
    return (
      <Screen>
        <Stagger>
          <Rise className="pb-5 pt-7">
            <p className="section-label">ICEFALL Guide</p>
            <h1 className="display mt-2.5 text-[30px] text-snow">{greeting}.</h1>
            <p className="mt-3 text-[12.5px] leading-relaxed text-mist">
              No guide account is signed in on this device, so there is nothing here yet.
            </p>
            <Link to="/welcome" className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-azure">
              Sign in <ArrowRight size={13} strokeWidth={1.8} />
            </Link>
          </Rise>
        </Stagger>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stagger>
        {/* ---- Chrome ------------------------------------------------------- */}
        <Rise className="flex items-center justify-between pt-6">
          <button type="button" aria-label="Menu" disabled className="text-mist disabled:opacity-40">
            <Menu size={22} strokeWidth={1.6} />
          </button>
          <Link to="/profile" aria-label="Notifications" className="relative text-mist">
            <Bell size={20} strokeWidth={1.6} />
            {s.unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-danger" />
            )}
          </Link>
        </Rise>

        {/* ---- Who is reading ----------------------------------------------- */}
        <Rise className="flex items-start justify-between gap-4 pb-1 pt-5">
          <div className="min-w-0">
            <p className="text-[13px] text-mist">{greeting},</p>
            <h1 className="mt-1 flex items-center gap-1.5 text-[22px] font-light leading-tight text-snow">
              <span className="truncate">{ME.name}</span>
              <StatusMarks
                credentials={status === "approved"}
                identity={identityVerified(APPLICATION)}
              />
            </h1>
            <p className="mt-1 text-[12px] text-mist-dim">{ME.title}</p>
          </div>
          <PersonAvatar name={ME.name} size={56} online />
        </Rise>

        {SHOW_DEMO_DATA && (
          <Rise className="pt-3">
            <Disclaimer>{DEMO_NOTICE}</Disclaimer>
          </Rise>
        )}

        {/* ---- The one thing that needs doing -------------------------------- */}
        {status !== "approved" ? (
          <Rise className="pt-4">
            <Notice tone={copy.tone === "bad" ? "danger" : "alert"}>
              <p className="text-snow">{copy.label}</p>
              <p className="mt-1.5">{copy.says}</p>
              <Link to="/verification" className="mt-2.5 inline-flex items-center gap-1.5 text-azure">
                Open verification <ArrowRight size={13} strokeWidth={1.8} />
              </Link>
            </Notice>
          </Rise>
        ) : soon.length > 0 ? (
          <Rise className="pt-4">
            <Notice tone="alert">
              <p className="text-snow">A document expires soon</p>
              <p className="mt-1.5">
                Your listing hides itself the day after it expires. Replace it before then and
                nothing is interrupted.
              </p>
              <Link to="/verification" className="mt-2.5 inline-flex items-center gap-1.5 text-azure">
                Review documents <ArrowRight size={13} strokeWidth={1.8} />
              </Link>
            </Notice>
          </Rise>
        ) : null}

        {/* ---- Overview this season ----------------------------------------- */}
        <Rise className="pt-5">
          <Card inset={false} className="overflow-hidden">
            <div className="flex items-baseline justify-between px-4 pt-4">
              <p className="section-label">Overview this season</p>
              <Link to="/analytics" className="text-[11.5px] text-azure">
                View all
              </Link>
            </div>
            <p className="tnum px-4 pb-3 pt-1.5 text-[11.5px] text-mist-dim">{seasonRange()}</p>

            <div className="grid grid-cols-3 divide-x divide-hairline border-t border-hairline">
              <Tile label="Bookings" reading={s.stats.bookings} format={String} />
              <Tile label="Clients" reading={s.stats.clients} format={String} />
              <Tile label="Earnings" reading={s.earnings.season} format={formatEur} />
            </div>
            <div className="grid grid-cols-3 divide-x divide-hairline border-t border-hairline">
              <Tile
                label="Success rate"
                reading={s.stats.successRate}
                format={(v) => `${Math.round(v * 100)}%`}
              />
              <Tile
                label="Rating"
                reading={s.stats.rating}
                format={(v) => `${v.toFixed(1)} ★`}
                foot={reviewCount() !== null ? `${reviewCount()} reviews` : undefined}
              />
              <Tile label="Summits" reading={s.stats.summits} format={(v) => `${v}+`} />
            </div>

            {/*
              THE REASONS SIT DIRECTLY UNDER THE GRID, IN THE SAME CARD.

              The mockup's overview is a fixed 2×3 of short figures, and a
              twenty-word sentence cannot live in a 90px cell without either
              collapsing the grid or being clipped — and the house rule is that a
              label which does not fit gets shorter, never truncated. So an
              unmeasured tile keeps its place with a short marker, and the full
              sentence appears immediately below, unmissable and in reading
              order. That is not a footnote under a dash: nothing is hidden
              behind a tap, and the reader meets the reason before they leave the
              card.
            */}
            {/*
              ONE LINE, NOT A STACK OF PARAGRAPHS. The owner cut the long
              explanatory blocks on 2026-08-30 and was right to: the same notice
              on eight screens is how a notice stops being read (§6h). What
              survives is the shortest form that still keeps the claim true —
              a figure the app invented has to say so somewhere the reader will
              actually meet it, and the tiles themselves carry the rest.
            */}
            {footnotes.length > 0 && (
              <p className="border-t border-hairline px-4 py-2.5 text-[11px] leading-relaxed text-mist-dim">
                {footnotes.join(" · ")}
              </p>
            )}
          </Card>
        </Rise>

        <NotificationOptIn className="pt-5" />

        {/* ---- Upcoming booking ---------------------------------------------- */}
        <Rise className="pt-6">
          <div className="flex items-baseline justify-between">
            <p className="section-label">Upcoming booking</p>
            <Link to="/clients" className="text-[11.5px] text-azure">
              View all
            </Link>
          </div>

          {next ? (
            <Link to={`/booking/${next.id}`} className="mt-3 block">
              <Card className="transition-colors hover:border-hairline-strong">
                <div className="flex items-center gap-3.5">
                  <Photo peak={next.peak} alt="" className="h-14 w-14 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] leading-snug text-snow">{next.title}</p>
                    <p className="tnum mt-1 text-[11.5px] text-mist-dim">
                      {fmtRange(next.from, next.to)}
                    </p>
                    <p className="mt-1 text-[11.5px] text-mist-dim">
                      {next.clients.length} {next.clients.length === 1 ? "Client" : "Clients"}
                    </p>
                    <StatusPill state={next.state === "pending" ? "pending" : "confirmed"} className="mt-2" />
                  </div>
                  <ChevronRight size={18} strokeWidth={1.6} className="shrink-0 text-mist-dim" />
                </div>
              </Card>
            </Link>
          ) : (
            <Card className="mt-3">
              <p className="py-2 text-center text-[13px] text-mist-dim">
                Nothing booked ahead. Your calendar is your own.
              </p>
            </Card>
          )}
        </Rise>

        {/* ---- Today's schedule ----------------------------------------------- */}
        <Rise className="pb-2 pt-6">
          <p className="section-label">Today's schedule</p>
          <Card className="mt-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13.5px] text-snow">{todayLabel(s.upcoming.length)}</p>
                <p className="mt-1 text-[12px] text-mist-dim">
                  {s.upcoming.length > 0
                    ? "Nothing on the hill today."
                    : "Nothing on the hill today. Enjoy your day."}
                </p>
              </div>
              <Link to="/availability" aria-label="Availability" className="text-mist-dim">
                <CalendarDays size={18} strokeWidth={1.6} />
              </Link>
            </div>
          </Card>
        </Rise>
      </Stagger>
    </Screen>
  );
}

function Tile<T>({
  label,
  reading,
  format,
  foot,
}: {
  label: string;
  reading: import("@/domain/honesty").Reading<T>;
  format: (v: T) => string;
  foot?: string;
}) {
  const value = reading.available ? format(reading.value) : null;
  return (
    <div className="px-3 py-3.5">
      <div className="min-h-[24px]">
        {value !== null ? (
          <p
            className={cn(
              "tnum font-light leading-none text-snow",
              /* Fit the cell. €10,457 does not fit at 19px in a 90px column, and
                 the house rule is to shorten the label, never let it truncate —
                 which for a figure means sizing it to its own length. */
              value.length > 7 ? "text-[15px]" : value.length > 5 ? "text-[17px]" : "text-[19px]",
            )}
          >
            {value}
          </p>
        ) : (
          <p className="text-[12.5px] leading-none text-mist-dim">Not recorded</p>
        )}
      </div>
      <p className="section-label mt-2">{label}</p>
      {foot && value !== null && <p className="tnum mt-1 text-[10px] text-mist-dim">{foot}</p>}
    </div>
  );
}

/** The season the figures describe, so "this season" is not an unbounded claim. */
function seasonRange(now = new Date()): string {
  const start = new Date(now.getFullYear(), 4, 1);
  const end = new Date(now.getFullYear(), 9, 31);
  const f = (d: Date) => d.toLocaleDateString("en-GB", { month: "short" });
  return `${f(start)} – ${f(end)} ${end.getFullYear()}`;
}

function todayLabel(upcoming: number): string {
  return upcoming > 0 ? "No events for today" : "No events for today";
}
