import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Container } from "@/components/Shell";
import { Label } from "@/components/ui";
import { TripSearch } from "@/components/TripSearch";
import { GuideCard, ExpeditionCard } from "./cards";
import { EXPEDITIONS, GUIDES } from "@/data/demo";
import { defaultSearch, searchToQuery } from "@/lib/trip";

/**
 * The front door — a trip search, not a catalogue.
 *
 * You say what you want first: a guide, a guide and the flights to reach them,
 * or the whole thing handled. Pick a mountain and dates, and ICEFALL returns
 * priced options. The honesty rules that govern the phone app govern this too —
 * every professional shown has had their documents checked, and nothing is
 * marked up that ICEFALL cannot stand behind.
 */
export default function Landing() {
  const navigate = useNavigate();

  return (
    <>
      {/* ---- Hero --------------------------------------------------------- */}
      <section className="relative overflow-hidden border-b border-hairline">
        <img
          src="/img/matterhorn.jpg"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/70 to-obsidian/30" />

        <Container className="relative py-20 lg:py-28">
          <p className="section-label text-azure">Guided mountaineering</p>
          <h1 className="display mt-4 max-w-[18ch] text-[42px] leading-[1.05] text-snow lg:text-[58px]">
            Book the guide. Or the whole trip.
          </h1>
          <p className="mt-5 max-w-[48ch] text-[15px] leading-relaxed text-mist">
            Tell us what you want — a checked guide, the guide with your flights, or the whole package
            handled — pick your mountain and dates, and we'll price it. Book, plan and pay in one place.
          </p>

          <div className="mt-8">
            <TripSearch
              initial={defaultSearch()}
              variant="hero"
              onSubmit={(s) => navigate(`/plan?${searchToQuery(s)}`)}
            />
          </div>

          <p className="mt-4 flex items-center gap-2 text-[12px] text-mist-dim">
            <ShieldCheck size={13} strokeWidth={1.7} className="text-azure" />
            Documents checked on every guide and company. We do not vouch for the mountain.
          </p>
        </Container>
      </section>

      {/* ---- Featured guides ---------------------------------------------- */}
      <Container className="py-16">
        <div className="flex items-end justify-between gap-4">
          <div>
            <Label>Find a guide</Label>
            <h2 className="mt-2 text-[24px] font-light text-snow">Private guiding, one on one</h2>
          </div>
          <Link to="/guides" className="inline-flex items-center gap-1.5 text-[13px] text-azure">
            All guides <ArrowRight size={14} strokeWidth={1.8} />
          </Link>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {GUIDES.slice(0, 3).map((g) => (
            <GuideCard key={g.id} guide={g} />
          ))}
        </div>
      </Container>

      {/* ---- Featured expeditions ----------------------------------------- */}
      <Container className="py-4 pb-16">
        <div className="flex items-end justify-between gap-4">
          <div>
            <Label>Join an expedition</Label>
            <h2 className="mt-2 text-[24px] font-light text-snow">
              Run by companies we have checked
            </h2>
          </div>
          <Link to="/expeditions" className="inline-flex items-center gap-1.5 text-[13px] text-azure">
            All expeditions <ArrowRight size={14} strokeWidth={1.8} />
          </Link>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {EXPEDITIONS.map((e) => (
            <ExpeditionCard key={e.id} expedition={e} />
          ))}
        </div>
      </Container>

      {/* ---- How it works ------------------------------------------------- */}
      <section className="border-t border-hairline bg-graphite/40">
        <Container className="py-16">
          <Label>How ICEFALL works</Label>
          <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-3">
            <Step
              n={1}
              title="Say what you want"
              body="A guide, the guide with your flights, or the whole package. Pick a mountain and dates, and we return priced options — the guiding checked, the rest shown at fare."
            />
            <Step
              n={2}
              title="Book, or enquire"
              body="A guide is booked and paid here — your money held until you meet. An expedition is arranged with the company directly; we make the introduction."
            />
            <Step
              n={3}
              title="Talk once it's real"
              body="Messaging opens after you book a guide, or send a qualified enquiry to a company. It keeps every arrangement, price and term on the record."
            />
          </div>
        </Container>
      </section>
    </>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div>
      <span className="tnum grid h-9 w-9 place-items-center rounded-full border border-azure/40 text-[13px] text-azure">
        {n}
      </span>
      <h3 className="mt-4 text-[16px] text-snow">{title}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-mist">{body}</p>
    </div>
  );
}
