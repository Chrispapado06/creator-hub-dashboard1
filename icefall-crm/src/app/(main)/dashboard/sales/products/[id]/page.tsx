import { bookings, companies, enquiries, placements, products } from "../_components/data";
import { ProductDetail } from "./_components/product-detail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <ProductDetail
      id={id}
      products={products}
      companies={companies}
      bookings={bookings}
      enquiries={enquiries}
      placements={placements}
    />
  );
}
