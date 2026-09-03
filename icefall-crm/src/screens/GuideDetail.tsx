import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Coins, MessagesSquare, Mountain } from "lucide-react";
import { Avatar } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
 *
 * LAYOUT: the reference theme's profile page — an identity header with the
 * badges on it and the actions to its right, a metric row, then the detail in
 * cards. The back link, the derived credential claim and every ticket
 * click-through survived the move.
 */

/**
 * The theme's metric card, with ICEFALL's honesty contract intact: `value` of
 * null prints the REASON there is no figure — never a dash, never a zero
 * standing in for one. A measured zero prints as "0".
 */
function Metric({
  icon,
  label,
  value,
  reason,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string | null;
  reason?: string;
  hint?: string;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <div className="flex size-7 items-center justify-center rounded-lg border bg-ui-muted text-muted-foreground">
            {icon}
          </div>
        </CardTitle>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {value === null ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{reason ?? "Not recorded"}</p>
        ) : (
          <>
            <div className="font-medium text-3xl leading-none tracking-tight tabular-nums">{value}</div>
            {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** One field of the guide's own claim — label above, value below, as the
 *  theme's profile details are drawn. An unfilled field says so in words. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

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
          /* `@container` is load-bearing, not decoration: size containment in
             the inline axis, so a wide card scrolls inside itself instead of
             pushing the page sideways. The reference theme gets the same
             result from an `overflow-x-hidden` on its page container. */
          <div className="@container/page flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <Avatar name={g.name} size={64} />
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex flex-col gap-0.5">
                    <h1 className="truncate font-heading text-2xl leading-7 tracking-tight">{g.name}</h1>
                    <p className="truncate text-sm leading-5 text-muted-foreground">
                      profile created {formatDay(g.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {g.listed ? (
                      <Badge
                        className="rounded-sm border-ok/20 bg-ok/10 text-ok"
                        variant="outline"
                      >
                        Listed
                      </Badge>
                    ) : (
                      <Badge
                        className="rounded-sm border-warn/20 bg-warn/10 text-warn"
                        variant="outline"
                      >
                        Not listed
                      </Badge>
                    )}
                    {/* The claim is derived — an expired document revokes it
                        automatically. And it never says "Verified guide": the
                        gap between "we read the papers" and "the federation
                        confirmed them" is ICEFALL's whole exposure. */}
                    {g.credentials_state === "checked" ? (
                      <Badge
                        className="rounded-sm border-ok/20 bg-ok/10 text-ok"
                        variant="outline"
                      >
                        Documents checked{g.credentials_checked_at ? ` ${formatDay(g.credentials_checked_at)}` : ""}
                      </Badge>
                    ) : g.credentials_state === "expired" ? (
                      <Badge
                        className="rounded-sm border-bad/20 bg-bad/10 text-bad"
                        variant="outline"
                      >
                        Certificate expired {formatDay(g.credentials_expire_at)}
                      </Badge>
                    ) : (
                      <Badge
                        className="rounded-sm border-warn/20 bg-warn/10 text-warn"
                        variant="outline"
                      >
                        Documents not checked
                      </Badge>
                    )}
                  </div>
                  {g.credentials_state === "checked" && (
                    <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
                      Documents checked by ICEFALL{g.credentials_checked_at ? ` on ${formatDay(g.credentials_checked_at)}` : ""}
                      {g.credentials_document_ref ? ` (${g.credentials_document_ref})` : ""}. We have
                      not contacted the issuing association.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/admin/guides" aria-label="Back to guides">
                    <ArrowLeft data-icon="inline-start" />
                    All guides
                  </Link>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs sm:grid-cols-3 dark:*:data-[slot=card]:bg-card">
              <Metric
                icon={<Mountain className="size-4" />}
                label="Bookings guided"
                value={myBookings !== null ? String(myBookings) : null}
                reason="The bookings table could not be read."
                hint="Bookings carrying this guide. A zero is a real zero."
              />
              <Metric
                icon={<Coins className="size-4" />}
                label="Commission generated"
                value={myCommission !== null && myCommission > 0 ? `€${(myCommission / 100).toLocaleString("en-GB")}` : null}
                reason={myCommission !== null ? "No guide booking of theirs has converted yet." : "The ledger could not be read."}
                hint="Recorded guide-stream commissions, waived excluded."
              />
              <Metric
                icon={<MessagesSquare className="size-4" />}
                label="Support threads"
                value={tickets.state === "ok" ? String(myTickets.length) : null}
                reason="The ticket list could not be read."
                hint="Their conversations with the desk, below."
              />
            </div>

            <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
              <Card className="min-w-0">
                <CardHeader className="border-b">
                  <CardTitle className="text-xl leading-none">Profile — written by the guide</CardTitle>
                  <CardDescription className="leading-snug">
                    These are the guide&rsquo;s own claims. Nothing here is a statement by ICEFALL until
                    their documents pass a real check.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="grid gap-5">
                    {(
                      [
                        ["Headline", g.headline],
                        ["Based in", g.based_in],
                        ["Years guiding", g.years_guiding !== null ? String(g.years_guiding) : null],
                      ] as const
                    ).map(([k, v]) => (
                      <Field key={k} label={k}>
                        {/* "Not filled in" is the guide's silence, said as such —
                            never a dash and never an invented value. */}
                        {v ?? <span className="text-muted-foreground">Not filled in</span>}
                      </Field>
                    ))}
                    <Field label="Mountains claimed">
                      {g.mountains.length > 0 ? (
                        <span className="flex flex-wrap gap-1.5">
                          {g.mountains.map((m) => (
                            <Badge key={m} className="rounded-sm" variant="outline">
                              {m}
                            </Badge>
                          ))}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">None yet</span>
                      )}
                    </Field>
                    <Field label="Specialities">
                      {g.specialities.length > 0 ? (
                        <span className="flex flex-wrap gap-1.5">
                          {g.specialities.map((m) => (
                            <Badge key={m} className="rounded-sm" variant="outline">
                              {m}
                            </Badge>
                          ))}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">None yet</span>
                      )}
                    </Field>
                  </dl>
                </CardContent>
              </Card>

              <Card className="min-w-0">
                <CardHeader className="border-b">
                  <CardTitle className="text-xl leading-none">Chats</CardTitle>
                  <CardDescription className="leading-snug">
                    Their support threads — the only recorded conversations ICEFALL holds with a
                    guide. Each row opens the same conversation view the desk uses.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  {tickets.state !== "ok" ? (
                    <p className="px-4 text-sm text-muted-foreground">The ticket list could not be read.</p>
                  ) : myTickets.length === 0 ? (
                    <p className="px-4 text-sm leading-relaxed text-muted-foreground">
                      No conversations. Their support threads appear here the moment they raise one
                      from the guide app.
                    </p>
                  ) : (
                    <div className="flex flex-col border-t">
                      {myTickets.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => navigate(`/admin/support/${t.id}`)}
                          className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-ui-muted/50"
                        >
                          <span className="grid min-w-0 gap-0.5">
                            <span className="block truncate text-sm font-medium">{t.subject}</span>
                            <span className="block truncate text-sm text-muted-foreground">
                              {t.snippet ?? "No messages yet"}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                            {formatMoment(t.created_at)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        );
      }}
    </Resolve>
  );
}
