import { createFileRoute } from "@tanstack/react-router";
import { OnlyFinderSection } from "@/components/onlyfinder/OnlyFinderSection";

export const Route = createFileRoute("/onlyfinder")({ component: OnlyFinderPage });

function OnlyFinderPage() {
  return (
    <div className="space-y-6">
      <OnlyFinderSection />
    </div>
  );
}
