import { Container } from "@/components/Shell";
import { Label } from "@/components/ui";
import { ExpeditionCard } from "./cards";
import { EXPEDITIONS } from "@/data/demo";

export default function Expeditions() {
  return (
    <Container className="py-12">
      <Label>Join an expedition</Label>
      <h1 className="mt-2 text-[30px] font-light text-snow">Expeditions</h1>
      <p className="mt-2 max-w-[54ch] text-[13.5px] leading-relaxed text-mist">
        Run by companies ICEFALL has verified. An expedition is arranged and paid directly with the
        company — ICEFALL makes the introduction and passes your verified experience with it.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {EXPEDITIONS.map((e) => (
          <ExpeditionCard key={e.id} expedition={e} />
        ))}
      </div>
    </Container>
  );
}
