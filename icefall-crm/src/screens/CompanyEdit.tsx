import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Bold,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Type,
  Underline,
} from "lucide-react";
import { Button, Card } from "@/components/ui";
import { CompanyLogo } from "@/components/CompanyLogo";
import { OFFLINE } from "@/offline/offline";
import { cn } from "@/lib/utils";
import { EDITOR_DEMO, operators } from "@/demo/operators";
import { Select } from "@/components/controls";

/**
 * Add / Edit Company — built 1:1 to the owner's mockup of 30 Aug 2026.
 *
 * A LOCAL MOCK SURFACE: nothing here writes anywhere. The real write path for
 * company records is the operator portal plus the approval boundary, and a
 * second, competing write path drawn in an afternoon would be exactly how two
 * copies of a company drift. "Save draft" and "Save & submit" therefore return
 * to the roster without claiming to have stored anything.
 *
 * PREFILL RULE, and it matters because real businesses appear in the roster:
 * a REAL company's form starts with only its public facts (name, website,
 * country, home city). Tagline, legal name, phone, address and description stay
 * empty — inventing a phone number for a real business is fabrication, not
 * demo data. The mockup's own strings live on as placeholders, which claim
 * nothing.
 */

const SECTIONS = [
  "Basic Info",
  "Profile & Media",
  "Expeditions",
  "Slot Placements",
  "Certifications",
  "Documents",
  "Team Members",
  "Settings & Access",
] as const;

const field =
  "h-10 w-full rounded-tile border border-line bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-faint focus:border-accent";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-muted">
        {label}
        {required && <span className="text-bad"> *</span>}
      </span>
      {children}
    </label>
  );
}

/** The unwired form's status choice, in the kit's listbox. */
function StatusPicker({ initial }: { initial: string }) {
  const [v, setV] = useState(initial);
  return (
    <Select
      value={v}
      onChange={setV}
      ariaLabel="Company status"
      className="w-full"
      options={[
        { value: "active", label: "Active" },
        { value: "onboarding", label: "Onboarding" },
        { value: "suspended", label: "Suspended" },
        { value: "unverified", label: "Unverified" },
      ]}
    />
  );
}

export default function CompanyEdit() {
  const navigate = useNavigate();
  const { rosterId } = useParams();
  const row = operators.find((r) => r.id === rosterId) ?? null;
  const [section, setSection] = useState<(typeof SECTIONS)[number]>("Basic Info");

  const demo = EDITOR_DEMO;
  const done = () => navigate("/admin/companies");

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] font-extrabold tracking-[-0.02em] text-ink">
          Add / Edit Company
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={done}>
            Cancel
          </Button>
          {/* Neither button stores anything — see the header. They end the
              mock edit, which is all a mock edit can honestly do. */}
          <Button variant="secondary" onClick={done}>
            Save draft
          </Button>
          <Button className="!bg-accent text-white hover:opacity-90" onClick={done}>
            Save & submit
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[230px_minmax(0,1fr)_300px]">
        {/* ── Section nav ────────────────────────────────────────────── */}
        <Card pad={false} className="py-2">
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSection(s)}
              className={cn(
                "block w-full px-4 py-2.5 text-left text-[13px] font-medium",
                s === section
                  ? "border-l-2 border-accent bg-accent-soft/60 text-accent-ink"
                  : "border-l-2 border-transparent text-muted hover:text-ink",
              )}
            >
              {s}
            </button>
          ))}
        </Card>

        {/* ── The form ───────────────────────────────────────────────── */}
        <div className="space-y-5">
          <Card>
            <p className="text-[15px] font-bold text-ink">Basic Information</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Company Name" required>
                <input className={field} defaultValue={row?.name ?? ""} placeholder="Elite Expeditions" />
              </Field>
              <Field label="Status">
                <StatusPicker initial={row?.status ?? "active"} />
              </Field>
              <Field label="Tagline">
                <input className={field} placeholder="Crafting unforgettable mountain experiences" />
              </Field>
              <Field label="Legal Name">
                <input className={field} placeholder="Elite Expeditions Pvt. Ltd." />
              </Field>
              <Field label="Website">
                <input className={field} defaultValue={row?.domain ? `https://${row.domain}` : ""} placeholder="https://eliteexpeditions.com" />
              </Field>
              <Field label="Email">
                <input className={field} placeholder="info@eliteexpeditions.com" />
              </Field>
              <Field label="Founded Year">
                <input className={field} placeholder="2015" />
              </Field>
              <Field label="Phone">
                <input className={field} placeholder="+977 1 4412345" />
              </Field>
            </div>
          </Card>

          <Card>
            <p className="text-[15px] font-bold text-ink">Headquarters</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_1.4fr]">
              <Field label="Country" required>
                <input className={field} defaultValue={row?.countries.split(",")[0] ?? ""} placeholder="Nepal" />
              </Field>
              <Field label="City" required>
                <input className={field} defaultValue={row?.city ?? ""} placeholder="Kathmandu" />
              </Field>
              <Field label="Address">
                <input className={field} placeholder="Thamel, Kathmandu 44600, Nepal" />
              </Field>
            </div>
          </Card>

          <Card>
            <p className="text-[15px] font-bold text-ink">Description</p>
            {/* The toolbar is drawn because the mockup draws it; no editor sits
                behind it yet, so the glyphs are decoration, not buttons. */}
            <div className="mt-3 flex items-center gap-3 rounded-t-tile border border-b-0 border-line px-3 py-2 text-muted" aria-hidden>
              <Bold size={14} strokeWidth={2.25} />
              <Italic size={14} strokeWidth={2.25} />
              <Underline size={14} strokeWidth={2.25} />
              <Type size={14} strokeWidth={2.25} />
              <ImageIcon size={14} strokeWidth={2} />
              <span className="h-4 w-px bg-line" />
              <List size={15} strokeWidth={2} />
              <ListOrdered size={15} strokeWidth={2} />
              <span className="h-4 w-px bg-line" />
              <Link2 size={14} strokeWidth={2} />
            </div>
            <textarea
              rows={5}
              className="block w-full rounded-b-tile border border-line bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-ink outline-none placeholder:text-faint focus:border-accent"
              placeholder="Elite Expeditions is a premier expedition company specializing in high-altitude climbs and treks across the Himalaya…"
            />
          </Card>
        </div>

        {/* ── Right rail ─────────────────────────────────────────────── */}
        <div className="space-y-5">
          <Card>
            <p className="text-[13.5px] font-bold text-ink">Company Logo</p>
            <div className="mt-4 flex flex-col items-center">
              {/* Offline the logo is never fetched from the company's own site — there
                  is nothing to reach. Initials render instead. */}
              <CompanyLogo name={row?.name ?? "New Company"} domain={OFFLINE ? null : row?.domain} size={72} />
              <span className="mt-3 inline-flex h-8 items-center rounded-pill border border-line px-3.5 text-[12px] font-medium text-ink">
                Change logo
              </span>
              <p className="mt-1.5 text-[11px] text-faint">PNG, JPG up to 2MB</p>
            </div>
          </Card>

          <Card>
            <p className="text-[13.5px] font-bold text-ink">Quick Summary</p>
            {demo ? (
              <div className="mt-3 space-y-2 text-[12.5px]">
                {(
                  [
                    ["Total Expeditions", demo.totalExpeditions],
                    ["Mountains", demo.mountains],
                    ["Active Slot Placements", demo.activeSlotPlacements],
                    ["Countries", demo.countries],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="text-muted">{k}</span>
                    <span className="tnum font-semibold text-ink">{v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[12px] leading-relaxed text-faint">
                Counts appear once this company has live content — nothing exists to count yet.
              </p>
            )}
          </Card>

          <Card>
            <p className="text-[13.5px] font-bold text-ink">Verification Status</p>
            {demo && row ? (
              <div className="mt-3 space-y-2.5 text-[12.5px]">
                <div className="flex items-center justify-between">
                  <span className="text-muted">Trust</span>
                  <span
                    className={cn(
                      "rounded-pill px-2.5 py-[3px] text-[11.5px] font-medium",
                      row.trust === "verified" ? "bg-mint text-ok" : "bg-raised text-muted ring-1 ring-line",
                    )}
                  >
                    {row.trust === "verified" ? "Verified" : row.trust === "pending" ? "Pending" : "Unverified"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">ICEFALL Check</span>
                  <span className="rounded-pill bg-mint px-2.5 py-[3px] text-[11.5px] font-medium text-ok">
                    {demo.icefallCheck}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Last checked</span>
                  <span className="tnum text-ink">{demo.lastChecked}</span>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[12px] leading-relaxed text-faint">
                No checks recorded — verification appears once a staff review has actually happened.
              </p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
