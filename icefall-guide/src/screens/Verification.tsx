import { useEffect, useState } from "react";
import { AlertTriangle, Check, FileText, Upload } from "lucide-react";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { Badge, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Notice } from "@/components/guide";
import { SupportEntry } from "@/components/Support";
import { visibleApplication, DEMO_NOTICE, fmtDate } from "@/data/demo";
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";
import { CredentialMark } from "@/components/StatusBadge";
import { onAuthChange } from "@/auth/account";
import {
  credentialsSentence,
  expiryLine,
  readCredentials,
  type CredentialsReading,
} from "@/domain/credentials";
import { daysUntil, hasExpired, parseDay } from "@/lib/day";
import { GUIDE_NOTICES } from "@/domain/honesty";
import {
  CREDENTIAL_SPECS,
  STATUS_COPY,
  effectiveStatus,
  expiringSoon,
  expiryDate,
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
  const APPLICATION = visibleApplication();
  /**
   * THE SERVER RECORD IS THE TRUTH, and the local application below it is the
   * sample. Both are shown because they answer different questions — "what has
   * ICEFALL actually recorded about me" and "what did I send them" — but the
   * order matters: the recorded check is first, and the demo section carries the
   * sample-data notice so the two can never be read as one contradicting itself.
   */
  const [creds, setCreds] = useState<CredentialsReading | null>(null);
  useEffect(() => {
    let alive = true;
    const read = () => void readCredentials().then((r) => alive && setCreds(r));
    read();
    const off = onAuthChange(read);
    return () => {
      alive = false;
      off();
    };
  }, []);

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

        {SHOW_DEMO_DATA && APPLICATION.documents.length > 0 && (
          <Rise>
            <Disclaimer>{DEMO_NOTICE}</Disclaimer>
          </Rise>
        )}

        {/* ---- What ICEFALL has recorded, server-derived -------------------- */}
        <Rise className="pt-5">
          <Card>
            <SectionLabel>What ICEFALL has recorded</SectionLabel>
            {creds === null ? (
              <p className="mt-2.5 text-[12.5px] text-mist-dim">Reading your check…</p>
            ) : creds.status === "unavailable" ? (
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist-dim">{creds.reason}</p>
            ) : (
              <>
                <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                  {creds.record.state === "checked" && <CredentialMark />}
                  <Badge
                    tone={
                      creds.record.state === "checked"
                        ? "summit"
                        : creds.record.state === "expired"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {creds.record.state === "checked"
                      ? "Documents checked"
                      : creds.record.state === "expired"
                        ? "Check lapsed"
                        : "Not checked yet"}
                  </Badge>
                </div>

                <p className="mt-3 text-[12.5px] leading-relaxed text-snow">
                  {credentialsSentence(creds.record)}
                </p>

                {expiryLine(creds.record) && (
                  <p className="tnum mt-2 text-[11.5px] text-mist-dim">
                    {expiryLine(creds.record)}
                  </p>
                )}

                {/* The state is decided in Postgres against `current_date`, so an
                    expiry here needs no client date arithmetic — the class of bug
                    that has cost this app four separate fixes. */}
                {creds.record.state === "expired" && (
                  <p className="mt-2.5 text-[11.5px] leading-relaxed text-danger">
                    Your listing is hidden while this stands. Send a current document and ICEFALL
                    will read it again.
                  </p>
                )}
              </>
            )}
          </Card>
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
                      /*
                        `parseDay` and `startOfDay`, not `new Date` and `now`.
                        This countdown measured to UTC midnight while `fmtDate`
                        beside it rendered the same string as a LOCAL day, so the
                        two disagreed by one across most of the planet — and at
                        the boundary it printed "(-1 days)" for a certificate the
                        app still treats as valid, three lines above copy saying
                        the last day is still theirs to work. Whole local days,
                        from the start of today, so the number means what the
                        guide's calendar means.
                      */
                      const on = expiryDate(d)!;
                      // `expiringSoon` only returns readable dates, so this is
                      // never null here — but the compiler asking is the point:
                      // the unreadable case is handled in the lapse path below,
                      // not silently rendered as a countdown of NaN.
                      const days = daysUntil(on) ?? 0;
                      return (
                        <li key={d.kind}>
                          <span className="tnum">
                            {spec?.label} — {fmtDate(on)}{" "}
                            <span className="text-alert">
                              ({days === 0 ? "today" : days === 1 ? "1 day" : `${days} days`})
                            </span>
                          </span>
                          {/*
                            WHO TOLD US THIS DATE, beside the date that is about
                            to hide their listing. A countdown is a materially
                            weaker claim when nobody has read the document it
                            came from — and the guide is the one person able to
                            tell us it is wrong.
                          */}
                          {d.expiry.status === "recorded" &&
                            d.expiry.source === "stated_by_holder" && (
                              <span className="mt-0.5 block text-[11px] leading-relaxed text-mist-dim">
                                {GUIDE_NOTICES.expiryProvenance(d.expiry.source)}
                              </span>
                            )}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-2.5 text-mist-dim">
                    Your listing hides itself the day after a document expires — the last day is still yours to
                    work. That is not a rejection
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
              /*
                THE THIRD INSTANCE OF ONE BUG IN THIS FILE, and the one that
                contradicted the app about itself. This read
                `new Date(doc.expiresAt) < new Date()` — UTC midnight, against
                this moment — while `effectiveStatus` compares a LOCAL day
                against the START of today. So a certificate expiring today got
                a red "Expired" badge on the same screen that told the guide the
                last day is still theirs to work, and in most timezones it got
                one a day early besides.
              */
              const docExpiry = doc ? expiryDate(doc) : null;
              /**
               * ONE FUNCTION DECIDES THIS, and it is the same one the lapse
               * status uses, so a badge cannot disagree with whether the guide
               * is actually listed. It also treats an unreadable date as
               * expired — a safety test that cannot read its input must not
               * answer "safe". Before this, `new Date(anything-unparseable)`
               * compared as NOT expired, so a damaged date read as valid.
               */
              const unreadable = docExpiry !== null && parseDay(docExpiry) === null;
              const expired = docExpiry !== null && hasExpired(docExpiry);
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
                        {/*
                          "EXPIRED" sat directly above "This is our fault, not a
                          lapse" — one card contradicting itself. Unreadable and
                          expired are hidden for the same reason and are not the
                          same statement, and the guide's next action differs.
                        */}
                        {expired && (
                          <Badge tone="danger">{unreadable ? "Date unreadable" : "Expired"}</Badge>
                        )}
                      </div>

                      <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-dim">
                        {spec.detail}
                      </p>

                      {doc ? (
                        <>
                          <p className="tnum mt-2 text-[11.5px] text-mist">
                            {doc.fileName}
                            {doc.reference && ` · ${doc.reference}`}
                            {docExpiry === null
                              ? ` · ${GUIDE_NOTICES.EXPIRY_NOT_RECORDED.toLowerCase().replace(/\.$/, "")}`
                              : unreadable
                                ? ""
                                : ` · expires ${fmtDate(docExpiry)}`}
                          </p>
                          {unreadable && (
                            <p className="mt-2 text-[11.5px] leading-relaxed text-danger">
                              {GUIDE_NOTICES.EXPIRY_UNREADABLE}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="mt-2 text-[11.5px] text-mist-dim">Not uploaded.</p>
                      )}

                      {/*
                        DISABLED, AND THE WORST INSTANCE OF ITS CLASS IN THIS APP.
                        There is no storage connected, so this button had no
                        handler: it looked live, clicked, and did nothing. On this
                        screen the person pressing it is a guide whose certificate
                        is expiring, replacing it to keep their listing up — they
                        would have believed they had. "A control that writes into
                        nothing is indistinguishable, to the person using it, from
                        one that works" (owner decision 14). The signup flow
                        already disables its upload buttons and says why; this is
                        the same rule, on the screen where it costs more.
                      */}
                      <Button variant="secondary" size="sm" className="mt-3" disabled>
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

        <Rise className="pt-4">
          <SupportEntry topic="verification" />
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
