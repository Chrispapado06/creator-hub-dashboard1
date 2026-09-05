import { bookings, companies, enquiries, placements, products } from "./_components/data";
import { Products } from "./_components/products";

export default function Page() {
  return (
    <Products
      products={products}
      companies={companies}
      bookings={bookings}
      enquiries={enquiries}
      placements={placements}
    />
  );
}
