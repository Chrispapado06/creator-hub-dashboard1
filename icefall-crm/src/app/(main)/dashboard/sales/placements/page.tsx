import {
  bookings,
  companies,
  destinations,
  enquiries,
  leadDestinations,
  placementViews,
  products,
} from "./_components/data";
import { Placements } from "./_components/placements";

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <h1 className="text-3xl tracking-tight">Placements</h1>
        <p className="text-muted-foreground text-sm">
          Paid positions by destination — five slots on a mountain, three on a trek, one company each.
        </p>
      </div>

      <Placements
        bookings={bookings}
        companies={companies}
        destinations={destinations}
        enquiries={enquiries}
        leadDestinations={leadDestinations}
        placements={placementViews()}
        products={products}
      />
    </div>
  );
}
