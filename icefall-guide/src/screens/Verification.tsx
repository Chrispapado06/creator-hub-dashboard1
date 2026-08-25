import { AlertTriangle, Check, FileText, Upload } from "lucide-react";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { Badge, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Notice } from "@/components/guide";
import { APPLICATION, DEMO_NOTICE, fmtDate } from "@/data/demo";
import {
  CREDENTIAL_SPECS,
  STATUS_COPY,
  effectiveStatus,
  expiringSoon,
  verificationSentence,
  type CredentialKind,
} from "@/data/model";
import { cn } from "@/lib/utils";

/**
 * What ICEFALL has checked, stated exactly.
 *
 * The design job here is resisting the obvious version — a green tick and the
 * word "Verified". A client reads that tick, stops asking to see the carnet, and
 * follows this person onto a glacier. So the screen says what was actually done
 * (a member of staff opened a document, on a date) and what was not (nobody rang
 * the association), and it shows the expiry that will end the claim.
 */
export default function Verification() {
  const status = effectiveStatus(APPLICATION);
  const copy = STATUS_COPY[status];
  const soon = expiringSoon(APPLICATION);
  const docFor = (k: CredentialKind) => APPLICATION.documents.find((d) => d.kind === k);

  const badgeTone =
    copy.tone === "ok" ? "summit" : copy.tone === "warn" ? "alert" : copy.tone === "bad" ? "danger" : "neutral";

  return (
    <Screen>
      <Stagger>
        <ScreenHeader title="Verification" subtitle="What ICEFALL has checked — and what it has not." />

        <Rise>
          <Disclaimer>{DEMO_NOTICE}</Disclaimer>
        </Rise>

        {/* ---- Status ------------------------------------------------------ */}
        <Rise className="pt-5">
          <Card>
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge tone={badgeTone}>{copy.label}</Badge>
              {APPLICATION.review && status === "approved" && (
                <span className="text-[11px] text-mist-dim">
                  {fmtDate(APPLICATION.review.decidedAt)} · {APPLICATION.review.decidedBy}
                </span>
              )}
            </div>

            <p className="mt-3 text-[12.5px] leading-relaxed text-mist">{copy.says}</p>

            {status === "approved" && (
              <div className="mt-3.5 rounded-tile border border-hairline bg-obsidian/50 p-3.5">
                <SectionLabel>What a client sees</SectionLabel>
                <p className="mt-2 text-[12.5px] leading-relaxed text-snow">
                  “{verificationSentence(APPLICATION)}”
                </p>
              </div>
            )}
          </Card>
        </Rise>

        {/* ---- Expiry ------------------------------------------------------ */}
        {soon.length > 0 && (
          <Rise className="pt-4">
            <Notice tone="alert">
              <div className="flex gap-2.5">
                <AlertTriangle size={15} strokeWidth={1.8} className="mt-px shrink-0 text-alert" />
                <div>
                  <p className="text-snow">
                    {soon.length === 1 ? "A document expires soon" : `${soon.length} documents expire soon`}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {soon.map((d) => {
                      const spec = CREDENTIAL_SPECS.find((s) => s.kind === d.kind);
                      const days = Math.ceil(
                        (new Date(d.expiresAt!).getTime() - Date.now()) / 86_400_000,
                      );
                      return (
                        <li key={d.kind} className="tnum">
                          {spec?.label} — {fmtDate(d.expiresAt!)}{" "}
                          <span className="text-alert">({days} days)</span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-2.5 text-mist-dim">
                    Your listing hides itself automatically when it expires. That is not a rejection
                    — replace the document and you are back the same day.
                  </p>
                </div>
              </div>
            </Notice>
          </Rise>
        )}

        {/* ---- Documents ---------------------------------------------------- */}
        <Rise className="pt-7">
          <SectionLabel>Your documents</SectionLabel>
          <div className="mt-3 space-y-2.5">
            {CREDENTIAL_SPECS.map((spec) => {
              const doc = docFor(spec.kind);
              const expired = doc?.expiresAt ? new Date(doc.expiresAt) < new Date() : false;
              const good = Boolean(doc) && !expired;

              return (
                <Card key={spec.kind}>
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-tile border",
                        good ? "border-summit/40 text-summit" : "border-hairline text-mist-dim",
                      )}
                    >
                      {good ? <Check size={15} strokeWidth={2} /> : <FileText size={14} strokeWidth={1.7} />}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13.5px] text-snow">{spec.label}</p>
                        {!spec.required && <Badge>If applicable</Badge>}
                        {expired && <Badge tone="danger">Expired</Badge>}
                      </div>

                      <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-dim">
                        {spec.detail}
                      </p>

                      {doc ? (
                        <p className="tnum mt-2 text-[11.5px] text-mist">
                          {doc.fileName}
                          {doc.reference && ` · ${doc.reference}`}
                          {doc.expiresAt && ` · expires ${fmtDate(doc.expiresAt)}`}
                        </p>
                      ) : (
                        <p className="mt-2 text-[11.5px] text-mist-dim">Not uploaded.</p>
                      )}

                      <Button variant="secondary" size="sm" className="mt-3">
                        <Upload size={13} strokeWidth={1.8} />
                        {doc ? "Replace" : "Upload"}
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </Rise>

        {/* ---- What the check is -------------------------------------------- */}
        <Rise className="pt-7">
          <SectionLabel>What our check is, and is not</SectionLabel>
          <Card className="mt-3">
            <div className="space-y-3 text-[12.5px] leading-relaxed text-mist">
              <p>
                <span className="text-snow">What we do.</span> A person at ICEFALL opens each
                document, reads it, and judges whether it is genuine and current. We record who
                decided and when.
              </p>
              <p>
                <span className="text-snow">What we do not do.</span> We do not contact your
                association or insurer to confirm the document is still on their register, and we
                make no judgement about whether you are a good guide.
              </p>
              <p>
                <span className="text-snow">Why it expires.</span> An approval is only as good as the
                paperwork under it. A badge that outlives its certificate is a false statement to a
                client.
              </p>
            </div>
          </Card>
        </Rise>
      </Stagger>
    </Screen>
  );
}
