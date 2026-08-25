import { Link } from "react-router-dom";
import { ArrowRight, Clock } from "lucide-react";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { Badge, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Notice } from "@/components/guide";
import {
  APPLICATION,
  DEMO_NOTICE,
  EARNINGS_BY_MONTH,
  ENQUIRIES,
  ME,
  OPENINGS,
  eur,
  fmtRange,
} from "@/data/demo";
import { STATUS_COPY, effectiveStatus, expiringSoon } from "@/data/model";
import { cn } from "@/lib/utils";

const toneFor = (t: string) =>
  t === "ok" ? "summit" : t === "warn" ? "alert" : t === "bad" ? "danger" : "gold";

export default function Today() {
  const status = effectiveStatus(APPLICATION);
  const copy = STATUS_COPY[status];
  const soon = expiringSoon(APPLICATION);
  const unread = ENQUIRIES.filter((e) => e.unread);
  const worst = Math.max(0, ...ENQUIRIES.map((e) => e.waitingHours));
  const live = OPENINGS.filter((o) => o.status === "open" || o.status === "full");
  const booked = OPENINGS.reduce((a, o) => a + o.taken * o.priceEur, 0);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <Screen>
      <Stagger>
        <Rise className="pb-5 pt-7">
          <p className="section-label">{ME.basedIn}</p>
          <h1 className="display mt-2.5 text-[30px] text-snow">
            {greeting},<br />
            {ME.name.split(" ")[0]}.
          </h1>
        </Rise>

        <Rise>
          <Disclaimer>{DEMO_NOTICE}</Disclaimer>
        </Rise>

        {/* ---- The one thing that needs doing ---------------------------- */}
        {status !== "approved" ? (
          <Rise className="pt-5">
            <Notice tone={toneFor(copy.tone)}>
              <p className="text-snow">{copy.label}</p>
              <p className="mt-1.5">{copy.says}</p>
              <Link to="/verification" className="mt-2.5 inline-flex items-center gap-1.5 text-gold">
                Open verification <ArrowRight size={13} strokeWidth={1.8} />
              </Link>
            </Notice>
          </Rise>
        ) : soon.length > 0 ? (
          <Rise className="pt-5">
            <Notice tone="alert">
              <p className="text-snow">A document expires soon</p>
              <p className="mt-1.5">
                Your listing hides itself the day it does. Replace it and nothing is interrupted.
              </p>
              <Link to="/verification" className="mt-2.5 inline-flex items-center gap-1.5 text-gold">
                Review documents <ArrowRight size={13} strokeWidth={1.8} />
              </Link>
            </Notice>
          </Rise>
        ) : null}

        {/* ---- Numbers ---------------------------------------------------- */}
        <Rise className="pt-6">
          <div className="grid grid-cols-3 gap-2.5">
            <Stat value={String(unread.length)} label="Waiting" alert={unread.length > 0} />
            <Stat value={String(live.length)} label="Live dates" />
            <Stat value={eur(booked)} label="Booked" />
          </div>
          {worst > 0 && (
            <p className="tnum mt-2.5 text-[11px] text-mist-dim">
              Longest a client has waited: {worst} h
            </p>
          )}
        </Rise>

        {/* ---- Waiting on you --------------------------------------------- */}
        <Rise className="pt-7">
          <div className="flex items-baseline justify-between">
            <SectionLabel>Waiting on you</SectionLabel>
            <Link to="/enquiries" className="text-[11px] text-gold">
              All clients
            </Link>
          </div>

          <div className="mt-3 space-y-2.5">
            {unread.map((e) => (
              <Card key={e.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] text-snow">{e.client}</p>
                    <p className="mt-0.5 text-[11.5px] text-mist-dim">
                      {e.peak} · {e.dates}
                    </p>
                  </div>
                  <Badge tone={e.waitingHours > 12 ? "danger" : "alert"}>
                    <Clock size={10} strokeWidth={2} />
                    {e.waitingHours} h
                  </Badge>
                </div>
                <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-relaxed text-mist">
                  “{e.message}”
                </p>
              </Card>
            ))}
            {unread.length === 0 && (
              <Card>
                <p className="py-3 text-center text-[13px] text-mist-dim">
                  Nothing waiting. Everyone has had an answer.
                </p>
              </Card>
            )}
          </div>
        </Rise>

        {/* ---- Next on the hill -------------------------------------------- */}
        <Rise className="pt-7">
          <SectionLabel>Next on the hill</SectionLabel>
          <Card className="mt-3" inset={false}>
            <ul className="divide-y divide-hairline">
              {live.slice(0, 3).map((o) => (
                <li key={o.id} className="flex items-baseline justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] text-snow">{o.peak}</p>
                    <p className="tnum mt-0.5 text-[11.5px] text-mist-dim">
                      {fmtRange(o.from, o.to)}
                    </p>
                  </div>
                  <span className="tnum shrink-0 text-[12px] text-mist">
                    {o.taken}/{o.places}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </Rise>

        {/* ---- Earnings ----------------------------------------------------- */}
        <Rise className="pt-7">
          <SectionLabel>Your fee, by month</SectionLabel>
          <Card className="mt-3">
            <div className="flex h-[86px] items-end gap-2">
              {EARNINGS_BY_MONTH.map((m, i) => {
                const max = Math.max(...EARNINGS_BY_MONTH.map((x) => x.eur));
                const last = i === EARNINGS_BY_MONTH.length - 1;
                return (
                  <div key={m.month} className="flex flex-1 flex-col items-center gap-2">
                    <div
                      title={eur(m.eur)}
                      style={{ height: `${(m.eur / max) * 64}px` }}
                      className={cn("w-full rounded-[3px]", last ? "bg-gold" : "bg-gold/25")}
                    />
                    <span className="text-[9.5px] uppercase tracking-[0.1em] text-mist-dim">
                      {m.month}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 border-t border-hairline pt-3 text-[11px] text-mist-dim">
              Before ICEFALL's commission. Nothing has been paid through ICEFALL yet.
            </p>
          </Card>
        </Rise>
      </Stagger>
    </Screen>
  );
}

function Stat({ value, label, alert }: { value: string; label: string; alert?: boolean }) {
  return (
    <div className="rounded-tile border border-hairline bg-graphite px-3 py-3.5">
      <p
        className={cn(
          "tnum text-[20px] font-light leading-none",
          alert ? "text-alert" : "text-snow",
        )}
      >
        {value}
      </p>
      <p className="section-label mt-2">{label}</p>
    </div>
  );
}
