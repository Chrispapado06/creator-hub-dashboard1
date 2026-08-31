import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Avatar, Card, PageHead, Pill, SectionLabel, Stat } from "@/components/ui";
import { Resolve } from "@/components/states";
import {
  listGuideBookings,
  listGuideCommissions,
  listGuideProfiles,
  listTickets,
} from "@/data/queries";
import { loading, ok, type Result } from "@/data/result";
import type { Commission, GuideRow, Ticket } from "@/data/types";
import { formatDay, formatMoment } from "@/lib/utils";

/**
 * One guide: profile, analytics, chats — CR-13's "once you click on a guide".
 *
 * Every figure is a sum or count of REAL rows scoped to this guide, which today
 * mostly means honest zeros and reasons. The chats section is their support
 * threads — the only recorded conversations ICEFALL holds with a guide; each
 * row opens the same conversation view the desk uses.
 */
export default function GuideDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [guides, setGuides] = useState<Result<GuideRow[]>>(loading);
  const [bookings, setBookings] = useState<Result<{ guide_id: string }[]>>(loading);
  const [commissions, setCommissions] = useState<
    Result<{ guide_id: string | null; amount_cents: number; status: Commission["status"] }[]>
  >(loading);
  const [tickets, setTickets] = useState<Result<Ticket[]>>(loading);

  const refresh = useCallback(() => {
    void listGuideProfiles().then(setGuides);
    void listGuideBookings().then(setBookings);
    void listGuideCommissions().then(setCommissions);
    void listTickets().then(setTickets);
  }, []);
  useEffect(refresh, [refresh]);

  const guide: Result<GuideRow> =
    guides.state === "ok"
      ? ((): Result<GuideRow> => {
          const g = guides.value.find((x) => x.id === id);
          return g ? ok(g) : { state: "error", reason: "No guide profile with that id." };
        })()
      : guides;

  return (
    <Resolve result={guide} what="the guide">
      {(g) => {
        const myBookings = bookings.state === "ok" ? bookings.value.filter((b) => b.guide_id === g.id).length : null;
        const myCommission =
          commissions.state === "ok"
            ? commissions.value.filter((c) => c.guide_id === g.id && c.status !== "waived").reduce((s, c) => s + c.amount_cents, 0)
            : null;
        const myTickets = tickets.state === "ok" ? tickets.value.filter((t) => t.customer_id === g.id) : [];
        return (
          <>
            <div className="mb-5 flex items-start gap-3">
              <Link to="/admin/guides" className="grid h-9 w-9 shrink-0 place-items-center rounded-tile border border-line bg-surface text-muted hover:text-ink" aria-label="Back to guides">
                <ArrowLeft size={16} strokeWidth={2} />
              </Link>
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={g.name} size={44} />
                <div className="min-w-0">
                  <PageHead title={g.name} />
                  <div className="-mt-4 flex flex-wrap items-center gap-2">
                    {g.listed ? <Pill tone="green">Listed</Pill> : <Pill tone="amber">Not listed</Pill>}
                    {/* The claim is derived — an expired document revokes it
                        automatically. And it never says "Verified guide": the
                        gap between "we read the papers" and "the federation
                        confirmed them" is ICEFALL's whole exposure. */}
                    {g.credentials_state === "checked" ? (
                      <Pill tone="green">Documents checked{g.credentials_checked_at ? ` ${formatDay(g.credentials_checked_at)}` : ""}</Pill>
                    ) : g.credentials_state === "expired" ? (
                      <Pill tone="red">Certificate expired {formatDay(g.credentials_expire_at)}</Pill>
                    ) : (
                      <Pill tone="amber">Documents not checked</Pill>
                    )}
                    <span className="text-[11.5px] text-faint">profile created {formatDay(g.created_at)}</span>
                  </div>
                  {g.credentials_state === "checked" && (
                    <p className="mt-1 text-[11.5px] text-faint">
                      Documents checked by ICEFALL{g.credentials_checked_at ? ` on ${formatDay(g.credentials_checked_at)}` : ""}
                      {g.credentials_document_ref ? ` (${g.credentials_document_ref})` : ""}. We have
                      not contacted the issuing association.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat
                label="Bookings guided"
                value={myBookings !== null ? String(myBookings) : null}
                reason="The bookings table could not be read."
                hint="Bookings carrying this guide. A zero is a real zero."
              />
              <Stat
                label="Commission generated"
                value={myCommission !== null && myCommission > 0 ? `€${(myCommission / 100).toLocaleString("en-GB")}` : null}
                reason={myCommission !== null ? "No guide booking of theirs has converted yet." : "The ledger could not be read."}
                hint="Recorded guide-stream commissions, waived excluded."
              />
              <Stat
                label="Support threads"
                value={tickets.state === "ok" ? String(myTickets.length) : null}
                reason="The ticket list could not be read."
                hint="Their conversations with the desk, below."
              />
            </div>

            <div className="mt-5 grid items-start gap-4 xl:grid-cols-2">
              <Card>
                <SectionLabel>Profile — written by the guide</SectionLabel>
                <dl className="mt-3 space-y-3 text-[13px]">
                  {(
                    [
                      ["Headline", g.headline],
                      ["Based in", g.based_in],
                      ["Years guiding", g.years_guiding !== null ? String(g.years_guiding) : null],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-faint">{k}</dt>
                      <dd className={v ? "mt-0.5 text-ink" : "mt-0.5 text-faint"}>{v ?? "Not filled in"}</dd>
                    </div>
                  ))}
                  <div>
                    <dt className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-faint">Mountains claimed</dt>
                    <dd className="mt-1 flex flex-wrap gap-1">
                      {g.mountains.length > 0 ? g.mountains.map((m) => <Pill key={m} tone="neutral">{m}</Pill>) : <span className="text-faint">None yet</span>}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-faint">Specialities</dt>
                    <dd className="mt-1 flex flex-wrap gap-1">
                      {g.specialities.length > 0 ? g.specialities.map((m) => <Pill key={m} tone="neutral">{m}</Pill>) : <span className="text-faint">None yet</span>}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-[11.5px] leading-relaxed text-faint">
                  These are the guide's own claims. Nothing here is a statement by ICEFALL until
                  their documents pass a real check.
                </p>
              </Card>

              <Card>
                <SectionLabel>Chats</SectionLabel>
                {tickets.state !== "ok" ? (
                  <p className="mt-2 text-[12.5px] text-faint">The ticket list could not be read.</p>
                ) : myTickets.length === 0 ? (
                  <p className="mt-2 text-[12.5px] text-faint">
                    No conversations. Their support threads appear here the moment they raise one
                    from the guide app.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {myTickets.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => navigate(`/admin/support/${t.id}`)}
                        className="flex w-full items-center justify-between gap-3 rounded-tile bg-raised px-3 py-2.5 text-left hover:bg-panel"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium text-ink">{t.subject}</span>
                          <span className="block truncate text-[12px] text-muted">{t.snippet ?? "No messages yet"}</span>
                        </span>
                        <span className="shrink-0 text-[11.5px] text-faint">{formatMoment(t.created_at)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </>
        );
      }}
    </Resolve>
  );
}
