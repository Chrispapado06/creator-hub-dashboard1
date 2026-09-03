import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { Container } from "@/components/Shell";
import { Label } from "@/components/ui";
import { GuideCard } from "./cards";
import { GUIDES } from "@/data/demo";

/** Browse all guides — the marketplace grid. */
export default function Guides() {
  const [params] = useSearchParams();
  const [q, setQ] = useState(() => params.get("q") ?? "");
  const list = GUIDES.filter((g) => {
    const hay = `${g.name} ${g.basedIn} ${g.headline} ${g.mountains.join(" ")}`.toLowerCase();
    return !q.trim() || hay.includes(q.trim().toLowerCase());
  });

  return (
    <Container className="py-12">
      <Label>Find a guide</Label>
      <h1 className="mt-2 text-[30px] font-light text-snow">Mountain guides</h1>
      <p className="mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-mist">
        Every guide here has had their licence, insurance and first aid checked by ICEFALL. Booking
        and payment run through us; your money is held until you meet.
      </p>

      <div className="mt-7 flex max-w-[420px] items-center gap-2.5 rounded-tile border border-hairline bg-graphite px-3.5 py-2.5 transition-colors focus-within:border-azure/55">
        <Search size={16} strokeWidth={1.7} className="shrink-0 text-mist-dim" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by mountain, place or name"
          className="w-full bg-transparent text-[14px] text-snow outline-none placeholder:text-mist-dim"
        />
      </div>

      <p className="mt-6 text-[12px] text-mist-dim">{list.length} guides</p>

      <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((g) => (
          <GuideCard key={g.id} guide={g} />
        ))}
      </div>

      {list.length === 0 && (
        <p className="py-16 text-center text-[13px] text-mist-dim">No guides match that search.</p>
      )}
    </Container>
  );
}
