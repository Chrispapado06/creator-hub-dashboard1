import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, ClipboardList, Coins, Users } from "lucide-react";
import { Avatar } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Resolve } from "@/components/states";
import { createGuideProfileFor, listGuideCommissions, listGuideProfiles, listProfilesBasic, setGuideListed } from "@/data/queries";
import { Select } from "@/components/controls";
import { loading, type Result } from "@/data/result";
import type { Commission, GuideRow } from "@/data/types";
import { formatDay } from "@/lib/utils";

/**
 * Guides — CR-13: how many, what commission they generated, and the approvals.
 *
 * GUIDES CREATE THEMSELVES (the ruling: a guide claims their own trade in the
 * guide app; the policy was built for it). What ICEFALL does here is decide
 * what the claim is WORTH: listing a guide is a staff act through
 * `set_guide_listed` — reason required, audited — and document checking is a
 * real record since 20260831120000: named checker, named document, expiry from
 * the paper, state DERIVED so a lapsed certificate revokes itself. The honest
 * sentence stays for a new reason — no longer "we cannot check" but "we read
 * the papers; the federation did not confirm them" — and nothing on this
 * screen may compress that into "verified".
 *
 * "Applications awaiting approval" and "mountains they want to add" are the
 * same queue seen honestly: an unlisted profile IS the application, and the
 * mountains on it ARE the claims awaiting the decision — they are what you
 * approve when you list. There is no separate request table, and this screen
 * does not invent one.
 *
 * COMMISSION FIGURES ARE SUMS OF REAL ROWS. Today the guide stream holds
 * nothing, so the tile says why rather than €0-as-decoration — but the sum is
 * live the moment a guide booking converts.
 *
 * LAYOUT: the reference theme, 1:1 — page header, metric cards, and every list
 * inside a card as a table. Nothing was removed to get there: the create form,
 * the approve-with-a-reason flow and both click-throughs are all still here.
 */

/**
 * The theme's metric card (dashboard/default/_components/metric-cards.tsx),
 * carrying ICEFALL's honesty contract unchanged: a `value` of null prints the
 * REASON there is no figure — never a dash, never a zero standing in for one.
 * A measured zero prints as "0", because that is a fact.
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

/** The theme's status badge: hairline outline, a coloured dot, the word. */
function CredentialBadge({ state }: { state: GuideRow["credentials_state"] }) {
  if (state === "checked") {
    return (
      <Badge
        className="gap-1.5 border border-ok/20 bg-ok/10 px-2 py-1 font-medium text-ok"
        variant="outline"
      >
        <span className="size-1.5 rounded-full bg-ok" />
        documents checked
      </Badge>
    );
  }
  if (state === "expired") {
    return (
      <Badge
        className="gap-1.5 border border-bad/20 bg-bad/10 px-2 py-1 font-medium text-bad"
        variant="outline"
      >
        <span className="size-1.5 rounded-full bg-bad" />
        certificate expired
      </Badge>
    );
  }
  return (
    <Badge
      className="gap-1.5 border border-warn/20 bg-warn/10 px-2 py-1 font-medium text-warn"
      variant="outline"
    >
      <span className="size-1.5 rounded-full bg-warn" />
      not checked
    </Badge>
  );
}

export default function Guides() {
  const navigate = useNavigate();
  const [guides, setGuides] = useState<Result<GuideRow[]>>(loading);
  const [commissions, setCommissions] = useState<
    Result<{ guide_id: string | null; amount_cents: number; status: Commission["status"] }[]>
  >(loading);
  const [listing, setListing] = useState<{ id: string; reason: string } | null>(null);
  const [people, setPeople] = useState<Result<{ id: string; display_name: string; role: string }[]>>(loading);
  const [newGuide, setNewGuide] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void listGuideProfiles().then(setGuides);
    void listGuideCommissions().then(setCommissions);
    void listProfilesBasic().then(setPeople);
  }, []);
  useEffect(refresh, [refresh]);

  const commissionTotal = useMemo(() => {
    if (commissions.state !== "ok") return null;
    return commissions.value
      .filter((c) => c.status !== "waived")
      .reduce((s, c) => s + c.amount_cents, 0);
  }, [commissions]);

  /** Owner-ordered: staff can create a guide profile FOR a user (the owner
   * wants one on their own account to walk the guide app's real cold start).
   * The row is exactly a self-created one — unlisted, unchecked, empty —
   * and the act is audited. */
  const createFor = async () => {
    if (!newGuide) return;
    setBusy(true);
    setErr(null);
    const r = await createGuideProfileFor(newGuide);
    setBusy(false);
    if (r.state !== "ok") setErr(r.state === "error" ? r.reason : "No database is configured.");
    else setNewGuide("");
    refresh();
  };

  const approve = async () => {
    if (!listing) return;
    setBusy(true);
    setErr(null);
    const r = await setGuideListed(listing.id, true, listing.reason);
    setBusy(false);
    setListing(null);
    if (r.state !== "ok") setErr(r.state === "error" ? r.reason : "No database is configured.");
    refresh();
  };

  return (
    /* `@container` is load-bearing, not decoration: it gives this box size
       containment in the inline axis, so a wide table scrolls inside its own
       card instead of pushing the whole page sideways and clipping its last
       column. The reference theme gets the same result from an
       `overflow-x-hidden` on its page container. */
    <div className="@container/page flex min-w-0 flex-col gap-4">
      {/* The theme's page header, verbatim: 30px, tracking-tight, regular
          weight, one muted line beneath it. */}
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl tracking-tight">Guides</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Independent guides who set themselves up in the guide app. ICEFALL decides what the claim
            is worth: listing is a staff act with a reason, and credentials stay unverified until a
            person checks documents.
          </p>
        </div>
      </div>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Create a guide profile for a user</CardTitle>
          <CardDescription className="max-w-3xl">
            The profile starts exactly as a self-created one would: unlisted, nothing checked, no
            availability — the honest cold start every real guide sees. The act is audited.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={newGuide}
              onChange={setNewGuide}
              ariaLabel="Person to create a guide profile for"
              placeholder="Choose a person…"
              className="min-w-[260px]"
              options={
                people.state === "ok"
                  ? people.value
                      .filter((p) => guides.state !== "ok" || !guides.value.some((g) => g.id === p.id))
                      .map((p) => ({ value: p.id, label: p.display_name, hint: p.role }))
                  : []
              }
            />
            <Button variant="outline" disabled={busy || !newGuide} onClick={() => void createFor()}>
              Create guide profile
            </Button>
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
        </CardContent>
      </Card>

      <Resolve
        result={guides}
        what="guide profiles"
        isEmpty={(v) => v.length === 0}
        empty="No guide has set up a profile yet. Guides create their own in the guide app; each lands here for review."
      >
        {(rows) => {
          const pending = rows.filter((g) => !g.listed);
          const live = rows.filter((g) => g.listed);
          return (
            <div className="flex min-w-0 flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-4 dark:*:data-[slot=card]:bg-card">
                <Metric
                  icon={<Users className="size-4" />}
                  label="Guides"
                  value={String(rows.length)}
                  hint="Profiles created in the guide app."
                />
                <Metric
                  icon={<BadgeCheck className="size-4" />}
                  label="Listed"
                  value={String(live.length)}
                  hint="Approved by staff, visible on the marketplace."
                />
                <Metric
                  icon={<ClipboardList className="size-4" />}
                  label="Awaiting review"
                  value={String(pending.length)}
                  hint="Unlisted profiles — the application queue."
                />
                <Metric
                  icon={<Coins className="size-4" />}
                  label="Commission generated"
                  value={
                    commissions.state === "ok"
                      ? commissionTotal! > 0
                        ? `€${(commissionTotal! / 100).toLocaleString("en-GB")}`
                        : null
                      : null
                  }
                  reason={
                    commissions.state === "ok"
                      ? "No guide booking has converted yet — the sum is live when one does."
                      : "The commission ledger could not be read."
                  }
                  hint="Sum of recorded guide-stream commissions, waived excluded."
                />
              </div>

              {err && <p className="text-sm text-destructive">{err}</p>}

              <Card className="min-w-0">
                <CardHeader className="border-b">
                  <CardTitle className="text-xl leading-none">
                    Awaiting approval
                    <span className="ms-2 text-muted-foreground tabular-nums">{pending.length}</span>
                  </CardTitle>
                  <CardDescription className="max-w-3xl leading-snug">
                    An unlisted profile is the application, and the mountains on it are the claims
                    you approve by listing. Listing needs a reason and is on the record; it never
                    marks credentials verified — the credential state stays DERIVED from checked
                    documents and their expiry, nothing else.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  {pending.length === 0 ? (
                    /* Reproduced, not improved: the queue being empty is a fact,
                       and it is said in the same words as before. */
                    <p className="px-4 text-sm text-muted-foreground">The queue is empty.</p>
                  ) : (
                    <Table className="**:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4">
                      <TableHeader className="[&_tr]:border-t">
                        <TableRow>
                          <TableHead className="py-4 font-normal">Guide</TableHead>
                          <TableHead className="py-4 font-normal">Mountains claimed</TableHead>
                          <TableHead className="py-4 text-right font-normal">Decision</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pending.map((g) => (
                          <TableRow key={g.id} className="border-border/60">
                            <TableCell className="py-4 align-middle">
                              <button
                                type="button"
                                onClick={() => navigate(`/admin/guides/${g.id}`)}
                                className="flex min-w-0 items-center gap-3 text-left"
                              >
                                <Avatar name={g.name} size={40} />
                                <span className="grid min-w-0 gap-0.5">
                                  <span className="truncate font-medium">{g.name}</span>
                                  {/* The word is unchanged and still carries the
                                      caution colour: an unlisted profile has had
                                      nothing checked, and that is the point of
                                      the row. */}
                                  <span className="flex">
                                    <Badge
                                      className="gap-1.5 border border-warn/20 bg-warn/10 px-2 py-1 font-medium text-warn"
                                      variant="outline"
                                    >
                                      <span className="size-1.5 rounded-full bg-warn" />
                                      unverified
                                    </Badge>
                                  </span>
                                </span>
                              </button>
                            </TableCell>
                            <TableCell className="py-4 align-middle whitespace-normal">
                              {g.mountains.length > 0 ? (
                                <span className="flex flex-wrap gap-1.5">
                                  {g.mountains.map((m) => (
                                    <Badge key={m} className="rounded-sm" variant="outline">
                                      {m}
                                    </Badge>
                                  ))}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">No mountains claimed yet</span>
                              )}
                            </TableCell>
                            <TableCell className="py-4 text-right align-middle">
                              {listing?.id === g.id ? (
                                <span className="flex flex-wrap items-center justify-end gap-2">
                                  <Input
                                    autoFocus
                                    value={listing.reason}
                                    onChange={(e) => setListing({ id: g.id, reason: e.target.value })}
                                    placeholder="Why — required and recorded"
                                    className="w-64"
                                  />
                                  <Button
                                    size="sm"
                                    disabled={busy || listing.reason.trim().length === 0}
                                    onClick={() => void approve()}
                                  >
                                    List guide
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setListing(null)}>
                                    Cancel
                                  </Button>
                                </span>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setListing({ id: g.id, reason: "" })}
                                >
                                  Approve listing…
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card className="min-w-0">
                <CardHeader className="border-b">
                  <CardTitle className="text-xl leading-none">
                    Listed guides
                    <span className="ms-2 text-muted-foreground tabular-nums">{live.length}</span>
                  </CardTitle>
                  <CardDescription className="max-w-3xl leading-snug">
                    Approved by staff and visible on the marketplace. The credential badge is derived
                    from checked documents and their expiry — it is never a statement that an issuing
                    association confirmed anything.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  {live.length === 0 ? (
                    <p className="px-4 text-sm text-muted-foreground">
                      Nobody is listed yet — approvals above put guides here.
                    </p>
                  ) : (
                    <Table className="**:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4">
                      <TableHeader className="[&_tr]:border-t">
                        <TableRow>
                          <TableHead className="py-4 font-normal">Guide</TableHead>
                          <TableHead className="py-4 font-normal">Credentials</TableHead>
                          <TableHead className="py-4 font-normal">Profile created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {live.map((g) => (
                          <TableRow
                            key={g.id}
                            className="cursor-pointer border-border/60"
                            onClick={() => navigate(`/admin/guides/${g.id}`)}
                          >
                            <TableCell className="py-4 align-middle">
                              <span className="flex min-w-0 items-center gap-3">
                                <Avatar name={g.name} size={40} />
                                <span className="grid min-w-0 gap-0.5">
                                  <span className="truncate font-medium">{g.name}</span>
                                  <span className="truncate text-xs text-muted-foreground">
                                    {g.headline ?? g.based_in ?? "No headline"}
                                  </span>
                                </span>
                              </span>
                            </TableCell>
                            <TableCell className="py-4 align-middle">
                              <CredentialBadge state={g.credentials_state} />
                            </TableCell>
                            <TableCell className="py-4 align-middle tabular-nums text-muted-foreground">
                              {formatDay(g.created_at)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          );
        }}
      </Resolve>
    </div>
  );
}
