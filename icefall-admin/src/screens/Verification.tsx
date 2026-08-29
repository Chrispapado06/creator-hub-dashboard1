import { useState } from "react";
import { Check, FileText, ShieldAlert, X } from "lucide-react";
import { Avatar, Button, Card, DemoBanner, PageHead, Pill, SectionLabel } from "@/components/ui";
import { cn } from "@/lib/utils";
import { expiryStatus, formatDay } from "@/lib/day";

/**
 * The review queue — where a guide is approved or not.
 *
 * The whole screen is built around one constraint: A REFUSAL MUST CARRY A REASON
 * THE APPLICANT CAN ACT ON. Someone's livelihood is on the other side of this
 * decision, and "declined" with no explanation is both cruel and useless. The
 * decline button stays disabled until a reason is written, and "Request changes"
 * exists so a missing certificate does not have to become a rejection.
 *
 * The approve button is deliberately the least dramatic thing here. Approving
 * means "I opened these documents and they look genuine" — nothing more — and
 * the copy under it says exactly what the badge will then claim.
 */

interface Applicant {
  id: string;
  name: string;
  basedIn: string;
  submitted: string;
  waitingDays: number;
  docs: { label: string; file: string; expires: string | null; ref?: string }[];
  flags: string[];
}

const QUEUE: Applicant[] = [
  {
    id: "a1",
    name: "Lena Hofstetter",
    basedIn: "Grindelwald, Switzerland",
    submitted: "14 Aug 2026",
    waitingDays: 3,
    docs: [
      { label: "Guiding qualification", file: "ifmga-carnet.pdf", expires: "2028-12-31", ref: "CH-5120" },
      { label: "First aid", file: "wfr.pdf", expires: "2027-05-12" },
      { label: "Insurance", file: "liability.pdf", expires: "2027-03-31", ref: "POL-44190" },
      { label: "Photo identity", file: "id.jpg", expires: null },
    ],
    flags: [],
  },
  {
    id: "a2",
    name: "Marco Benedetti",
    basedIn: "Courmayeur, Italy",
    submitted: "16 Aug 2026",
    waitingDays: 1,
    docs: [
      { label: "Guiding qualification", file: "carnet-scan.jpg", expires: "2027-06-30", ref: "IT-2288" },
      { label: "First aid", file: "first-aid.pdf", expires: "2026-02-02" },
      { label: "Photo identity", file: "passport.jpg", expires: null },
    ],
    flags: ["First aid certificate expired 02 Feb 2026", "No insurance certificate supplied"],
  },
  {
    id: "a3",
    name: "Sofia Nowak",
    basedIn: "Zakopane, Poland",
    submitted: "09 Aug 2026",
    waitingDays: 8,
    docs: [
      { label: "Guiding qualification", file: "licence.pdf", expires: "2027-12-31", ref: "PL-0913" },
      { label: "First aid", file: "wfr-2026.pdf", expires: "2027-09-18" },
      { label: "Insurance", file: "policy.pdf", expires: "2026-12-31", ref: "PL-INS-771" },
      { label: "Avalanche training", file: "avy-2.pdf", expires: "2028-11-01" },
      { label: "Photo identity", file: "id-card.png", expires: null },
    ],
    flags: [],
  },
];

export default function Verification() {
  const [selected, setSelected] = useState(QUEUE[0].id);
  const [reason, setReason] = useState("");
  const app = QUEUE.find((a) => a.id === selected)!;

  return (
    <>
      <PageHead
        title="Verification queue"
        subtitle={`${QUEUE.length} guides waiting on a decision.`}
      />

      <DemoBanner>
        Placeholder applicants — these people do not exist and no decision here is recorded
        anywhere. The buttons show what the flow will do, not what it does today.
      </DemoBanner>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[290px_1fr]">
        {/* ---- Queue ------------------------------------------------------ */}
        <Card pad={false} className="h-fit">
          <div className="border-b border-line px-4 py-3">
            <SectionLabel>Waiting</SectionLabel>
          </div>
          <ul className="divide-y divide-line-soft">
            {QUEUE.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => {
                    setSelected(a.id);
                    setReason("");
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors",
                    selected === a.id ? "bg-accent-soft/60" : "hover:bg-raised",
                  )}
                >
                  <Avatar name={a.name} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-ink">{a.name}</p>
                    <p className="truncate text-[11.5px] text-faint">{a.basedIn}</p>
                  </div>
                  <Pill tone={a.waitingDays > 5 ? "red" : a.flags.length ? "amber" : "neutral"}>
                    {a.waitingDays}d
                  </Pill>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {/* ---- Decision --------------------------------------------------- */}
        <div className="space-y-3">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar name={app.name} size={40} tone="accent" />
                <div>
                  <h2 className="text-[16px] text-ink">{app.name}</h2>
                  <p className="text-[12.5px] text-muted">
                    {app.basedIn} · submitted {app.submitted}
                  </p>
                </div>
              </div>
              {app.waitingDays > 5 && <Pill tone="red">Waiting {app.waitingDays} days</Pill>}
            </div>

            {app.flags.length > 0 && (
              <div className="mt-4 rounded-tile border border-[oklch(0.88_0.06_40)] bg-[oklch(0.982_0.02_40)] p-3.5">
                <div className="flex gap-2.5">
                  <ShieldAlert size={16} strokeWidth={1.8} className="mt-[1px] shrink-0 text-[oklch(0.6_0.15_35)]" />
                  <div>
                    <p className="text-[12.5px] font-medium text-[oklch(0.45_0.12_35)]">
                      Automatic checks found problems
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {app.flags.map((f) => (
                        <li key={f} className="text-[12.5px] text-[oklch(0.45_0.09_35)]">
                          · {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card pad={false}>
            <div className="border-b border-line px-4 py-3">
              <SectionLabel>Documents</SectionLabel>
            </div>
            <ul className="divide-y divide-line-soft">
              {app.docs.map((d) => {
                // FOUR OUTCOMES, NOT TWO — see `lib/day.ts`.
                //
                // "Expired" and "we hold a date we cannot read" both block
                // approval, but they are opposite accusations: one says this
                // guide let their paperwork lapse, the other says ICEFALL broke
                // its own record. Showing "Expired" for an unreadable value
                // tells a professional their certificate ran out when it may be
                // perfectly current — and it is our bug, not theirs.
                //
                // The predicate underneath fails CLOSED: unreadable counts as
                // lapsed. The earlier version of this file answered "not
                // expired" for every value it could not parse, which waved a
                // genuinely expired certificate straight past the reviewer.
                const expiry = expiryStatus(d.expires);
                return (
                  <li key={d.label} className="flex items-center gap-3 px-4 py-3">
                    <FileText size={15} strokeWidth={1.7} className="shrink-0 text-faint" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-ink">{d.label}</p>
                      <p className="truncate text-[11.5px] text-faint">
                        {d.file}
                        {d.ref && ` · Ref ${d.ref}`}
                      </p>
                      {/*
                        The literal oklch below, not `text-amber` — this app
                        defines no `amber` colour token, so `text-amber` would
                        compile to nothing and this warning would render as
                        ordinary grey body text. Matches the amber `Pill`.
                      */}
                      {expiry.kind === "unreadable" && (
                        <p className="mt-1 text-[11.5px] leading-relaxed text-[oklch(0.48_0.1_70)]">
                          The expiry date ICEFALL holds for this document cannot be read. That is our
                          record at fault, not necessarily the certificate — check the document itself
                          before deciding.
                        </p>
                      )}
                    </div>
                    {expiry.kind === "none" && <Pill>No expiry recorded</Pill>}
                    {expiry.kind === "unreadable" && <Pill tone="amber">Date unreadable</Pill>}
                    {expiry.kind === "expired" && (
                      <Pill tone="red">Expired {formatDay(expiry.day)}</Pill>
                    )}
                    {expiry.kind === "valid" && (
                      <Pill tone="neutral">Expires {formatDay(expiry.day)}</Pill>
                    )}
                    <Button variant="secondary" size="sm">
                      Open
                    </Button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <SectionLabel>Decision</SectionLabel>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
              Approving means one thing: you opened these documents and judged them genuine. The
              guide's badge will say “Documents checked by ICEFALL on {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}. We
              have not contacted the issuing association.” — nothing stronger.
            </p>

            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Reason — required to decline or request changes. The applicant reads this word for word."
              className="mt-3 w-full resize-none rounded-tile border border-line bg-raised p-3 text-[13px] text-ink outline-none placeholder:text-faint focus:border-accent focus:bg-surface"
            />

            <div className="mt-3 flex flex-wrap gap-2">
              <Button>
                <Check size={15} strokeWidth={2} />
                Approve
              </Button>
              <Button variant="secondary" disabled={!reason.trim()}>
                Request changes
              </Button>
              <Button
                variant="secondary"
                disabled={!reason.trim()}
                className={cn(reason.trim() && "border-[oklch(0.8_0.09_25)] text-[oklch(0.5_0.15_25)]")}
              >
                <X size={15} strokeWidth={2} />
                Decline
              </Button>
            </div>

            {!reason.trim() && (
              <p className="mt-2.5 text-[11.5px] text-faint">
                Declining and requesting changes both need a reason first — someone's income depends
                on this, and “no” without a cause they can act on is not a decision they can do
                anything with.
              </p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
