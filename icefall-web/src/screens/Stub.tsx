import { Container } from "@/components/Shell";
import { Label } from "@/components/ui";

export function Mountains() {
  return <Stub label="Explore" title="Mountains" note="The peak pages — conditions, routes, seasons — port next from the app." />;
}
export function Messages() {
  return <Stub label="Your messages" title="Messages" note="The two-pane desktop chat, on the same model as the app, ports next." />;
}

function Stub({ label, title, note }: { label: string; title: string; note: string }) {
  return (
    <Container className="py-20">
      <Label>{label}</Label>
      <h1 className="mt-2 text-[30px] font-light text-snow">{title}</h1>
      <p className="mt-3 max-w-[46ch] text-[13.5px] leading-relaxed text-mist">{note}</p>
    </Container>
  );
}
