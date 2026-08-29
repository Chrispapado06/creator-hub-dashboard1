/**
 * Create a trip.
 *
 * THE MOUNTAIN LIST IS THE AUTHORIZATION BOUNDARY, RENDERED. Only mountains with
 * an ACTIVE CompanyMountain row appear — so an operator cannot select a mountain
 * Icefall never sold them, and cannot select one whose placement has lapsed.
 * The backend refuses both as well; this is the same rule expressed where the
 * operator meets it, so the refusal is never a surprise.
 *
 * A new trip is created as a DRAFT. Nothing an operator makes is public on
 * creation.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Field, inputClass, Notice, PageHeader } from "@/components/ui";
import { manageableMountainIds } from "@/domain/authz";
import type { ProductKind } from "@/domain/types";
import { useOperator, useSession } from "@/state/OperatorContext";

export default function ProductNew() {
  const session = useSession();
  const { backend, access, mountains, refresh } = useOperator();
  const navigate = useNavigate();

  const allowed = manageableMountainIds(session, access);
  const options = mountains.filter((m) => allowed.includes(m.id));

  const [kind, setKind] = useState<ProductKind>("expedition");
  const [name, setName] = useState("");
  const [mountainId, setMountainId] = useState(options[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    const res = await backend.createProduct(session, { kind, name, mountainId });
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    refresh();
    navigate(`/operator/products/${res.value.id}`);
  };

  if (options.length === 0) {
    return (
      <>
        <PageHeader title="New trip" />
        <Notice>
          You have no active mountains at the moment, so there is nowhere to list a trip. Icefall assigns
          mountains commercially — talk to your Icefall contact.
        </Notice>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="New trip"
        detail="Start with the essentials. You can add the itinerary, pricing and departures next, then send it to Icefall for approval."
      />

      <Card className="max-w-xl p-4">
        <div className="space-y-4">
          <Field label="What kind of trip is this?">
            <div className="flex gap-1.5">
              {(["expedition", "trek"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setKind(t)}
                  className={`rounded-tile px-3 py-1.5 text-[13px] font-medium capitalize transition-colors ${
                    kind === t ? "bg-azure text-canvas" : "hairline bg-surface text-muted hover:text-ink"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Trip name" hint="What a climber will see. Name the route where there is one.">
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Everest — South Col"
            />
          </Field>

          <Field
            label="Mountain"
            hint="Only the mountains Icefall has assigned to your company are listed."
          >
            <select className={inputClass} value={mountainId} onChange={(e) => setMountainId(e.target.value)}>
              {options.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>

          {error && <Notice tone="rejected">{error}</Notice>}

          <div className="flex items-center gap-2 border-t border-line-soft pt-4">
            <Button variant="primary" onClick={() => void create()} disabled={!name.trim()}>
              Create as draft
            </Button>
            <Button variant="quiet" onClick={() => navigate("/operator/products")}>
              Cancel
            </Button>
          </div>
          <p className="text-[11.5px] leading-snug text-muted">
            Creating a trip does not publish it. It stays a draft, visible only to your team, until you submit
            it and Icefall approves it.
          </p>
        </div>
      </Card>
    </>
  );
}
