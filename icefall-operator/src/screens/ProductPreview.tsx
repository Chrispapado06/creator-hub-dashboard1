/**
 * Preview — what a climber would see.
 *
 * Spec §17 asks for previews "so an operator can see what their public content
 * will look like before submitting". Two things make this preview honest rather
 * than decorative:
 *
 *   1. It renders the PENDING version when one exists, clearly labelled, so the
 *      operator is looking at what they are proposing rather than at what is
 *      already live.
 *   2. It renders only fields that exist. Where the live record has no price, it
 *      says the trip is quoted — it does not invent a "from" figure to make the
 *      layout look finished. A preview that fills its own gaps teaches an
 *      operator to expect a page they will never get.
 */

import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Button, Card, Notice, PageHeader, StatusChip, formatPriceRange } from "@/components/ui";
import { formatDay } from "@/domain/dates";
import { chipForProduct } from "@/domain/types";
import { useAsync, useOperator, useSession } from "@/state/OperatorContext";

export default function ProductPreview() {
  const { id = "" } = useParams();
  const session = useSession();
  const { backend, company, mountains, revision } = useOperator();

  const product = useAsync(() => backend.getProduct(session, id), [session, id, revision], null);
  const departures = useAsync(() => backend.getDepartures(session, id), [session, id, revision], []);
  const versions = useAsync(() => backend.getVersions(session, "product"), [session, revision], []);

  if (!product) return <Notice>This trip either does not exist or belongs to another company.</Notice>;

  const pending = versions.find((v) => v.entityId === id && v.state === "pending");
  const proposed = (pending?.payload ?? {}) as Record<string, unknown>;

  const description = (proposed.description as string) ?? product.description;
  const priceFrom =
    proposed.priceFromCents !== undefined ? Number(proposed.priceFromCents) : product.priceFromCents;
  const price = formatPriceRange(priceFrom, product.priceToCents, product.currency);
  const mountainNames = product.mountainIds
    .map((m) => mountains.find((x) => x.id === m)?.name ?? "")
    .filter(Boolean);

  return (
    <>
      <PageHeader
        title="Preview"
        detail="How this trip reads on Icefall."
        action={
          <Link to={`/operator/products/${product.id}`}>
            <Button>
              <ArrowLeft size={14} aria-hidden /> Back to editing
            </Button>
          </Link>
        }
      />

      <div className="mb-4">
        {pending ? (
          <Notice tone="pending" title="Previewing your proposed version">
            This is the edit awaiting Icefall's review, not what is public right now.
          </Notice>
        ) : (
          <Notice>
            This is your current live content. <StatusChip status={chipForProduct(product.status)} />
          </Notice>
        )}
      </div>

      {/*
        Deliberately a plain, quiet rendering rather than a mimic of the consumer
        app's cinematic dark styling. A pixel-perfect fake would be a promise
        about a layout this session does not own and cannot keep in sync.
      */}
      <Card className="mx-auto max-w-2xl overflow-hidden">
        <div className="border-b border-line-soft bg-canvas px-5 py-4">
          <div className="text-[11px] font-medium tracking-wide text-faint uppercase">
            {product.kind === "expedition" ? "Expedition" : "Trek"}
            {mountainNames.length ? ` · ${mountainNames.join(", ")}` : ""}
          </div>
          <h2 className="mt-1 text-[19px] font-semibold tracking-tight text-ink">{product.name}</h2>
          <div className="mt-1 text-[12.5px] text-muted">{company?.name}</div>
        </div>

        <div className="space-y-5 px-5 py-5">
          {description && <p className="text-[13.5px] leading-relaxed text-ink">{description}</p>}

          <dl className="grid grid-cols-2 gap-4 border-y border-line-soft py-4 sm:grid-cols-4">
            <div>
              <dt className="text-[11px] tracking-wide text-faint uppercase">Duration</dt>
              <dd className="tnum mt-0.5 text-[13px] text-ink">
                {product.durationDays ? `${product.durationDays} days` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-wide text-faint uppercase">Highest point</dt>
              <dd className="tnum mt-0.5 text-[13px] text-ink">
                {product.maxAltitudeM ? `${product.maxAltitudeM.toLocaleString("en-GB")} m` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-wide text-faint uppercase">Season</dt>
              <dd className="mt-0.5 text-[13px] text-ink">{product.seasonality ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-wide text-faint uppercase">Price</dt>
              {/* No invented figure. "Quoted" is the truth when there is no price. */}
              <dd className="tnum mt-0.5 text-[13px] text-ink">{price ?? "Quoted"}</dd>
            </div>
          </dl>

          {product.difficulty && (
            <div>
              <h3 className="text-[12.5px] font-semibold text-ink">Who this is for</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{product.difficulty}</p>
            </div>
          )}

          {departures.length > 0 && (
            <div>
              <h3 className="text-[12.5px] font-semibold text-ink">Departures</h3>
              <ul className="mt-1.5 space-y-1">
                {departures.map((d) => (
                  <li key={d.id} className="tnum flex justify-between text-[12.5px]">
                    <span className="text-ink">{formatDay(d.departureDate)}</span>
                    <span className="text-muted capitalize">{d.availability}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {product.inclusions.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="text-[12.5px] font-semibold text-ink">Included</h3>
                <ul className="mt-1.5 space-y-1">
                  {product.inclusions.map((x) => (
                    <li key={x} className="text-[12.5px] text-ink">
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-[12.5px] font-semibold text-ink">Not included</h3>
                <ul className="mt-1.5 space-y-1">
                  {product.exclusions.map((x) => (
                    <li key={x} className="flex items-start gap-1.5 text-[12.5px] text-muted">
                      <span aria-hidden className="mt-[7px] h-px w-2 shrink-0 bg-faint" />
                      <span>{x}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/*
            The enquiry route, as a climber sees it. No phone number, no email,
            no booking link — spec §2 and §5. Shown here so the operator
            understands the model rather than experiencing it as a restriction.
          */}
          <div className="rounded-tile bg-canvas px-3 py-3">
            <div className="text-[12.5px] font-medium text-ink">Enquire through Icefall</div>
            <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
              Climbers message you here, and the conversation arrives in your inbox. Keeping it inside Icefall
              is what makes the booking attributable to you.
            </p>
          </div>
        </div>
      </Card>
    </>
  );
}
