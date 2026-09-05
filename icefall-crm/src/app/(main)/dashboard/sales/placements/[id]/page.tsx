import { auditEvents, companies, destinations, placementViews } from "../_components/data";
import { PlacementDetail } from "./_components/placement-detail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const placement = placementViews().find((p) => p.id === id) ?? null;

  return (
    <PlacementDetail
      auditEvents={auditEvents}
      companies={companies}
      destinations={destinations}
      placement={placement}
    />
  );
}
