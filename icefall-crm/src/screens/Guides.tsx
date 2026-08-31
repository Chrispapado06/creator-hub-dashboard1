import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, Button, Card, PageHead, Pill, SectionLabel, Stat } from "@/components/ui";
import { Resolve } from "@/components/states";
import { listGuideCommissions, listGuideProfiles, setGuideListed } from "@/data/queries";
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
 */
export default function Guides() {
  const navigate = useNavigate();
  const [guides, setGuides] = useState<Result<GuideRow[]>>(loading);
  const [commissions, setCommissions] = useState<
    Result<{ guide_id: string | null; amount_cents: number; status: Commission["status"] }[]>
  >(loading);
  const [listing, setListing] = useState<{ id: string; reason: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void listGuideProfiles().then(setGuides);
    void listGuideCommissions().then(setCommissions);
  }, []);
  useEffect(refresh, [refresh]);

  const commissionTotal = useMemo(() => {
    if (commissions.state !== "ok") return null;
    return commissions.value
      .filter((c) => c.status !== "waived")
      .reduce((s, c) => s + c.amount_cents, 0);
  }, [commissions]);

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
    <>
      <PageHead
        title="Guides"
        subtitle="Independent guides who set themselves up in the guide app. ICEFALL decides what the claim is worth: listing is a staff act with a reason, and credentials stay unverified until a person checks documents."
      />

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
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Stat tone="sky" label="Guides" value={String(rows.length)} hint="Profiles created in the guide app." />
                <Stat tone="mint" label="Listed" value={String(live.length)} hint="Approved by staff, visible on the marketplace." />
                <Stat tone="butter" label="Awaiting review" value={String(pending.length)} hint="Unlisted profiles — the application queue." />
                <Stat
                  tone="lilac"
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

              {err && <p className="mt-3 text-[12.5px] text-bad">{err}</p>}

              <div className="mt-6">
                <SectionLabel>Awaiting approval ({pending.length})</SectionLabel>
                <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-muted">
                  An unlisted profile is the application, and the mountains on it are the claims
                  you approve by listing. Listing needs a reason and is on the record; it never
                  marks credentials verified — that stays pinned off until documents are checked
                  by a person.
                </p>
                {pending.length === 0 ? (
                  <Card className="mt-2.5">
                    <p className="text-[12.5px] text-faint">The queue is empty.</p>
                  </Card>
                ) : (
                  <div className="mt-2.5 space-y-2">
                    {pending.map((g) => (
                      <Card key={g.id} className="flex flex-wrap items-center gap-4">
                        <button type="button" onClick={() => navigate(`/admin/guides/${g.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                          <Avatar name={g.name} size={38} />
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-[13.5px] font-semibold text-ink">{g.name}</span>
                              <Pill tone="amber">unverified</Pill>
                            </span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-1">
                              {g.mountains.length > 0 ? (
                                g.mountains.map((m) => <Pill key={m} tone="neutral">{m}</Pill>)
                              ) : (
                                <span className="text-[12px] text-faint">No mountains claimed yet</span>
                              )}
                            </span>
                          </span>
                        </button>
                        {listing?.id === g.id ? (
                          <span className="flex items-center gap-2">
                            <input
                              autoFocus
                              value={listing.reason}
                              onChange={(e) => setListing({ id: g.id, reason: e.target.value })}
                              placeholder="Why — required and recorded"
                              className="h-9 w-64 rounded-tile border border-line bg-surface px-3 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-accent"
                            />
                            <Button size="sm" className="!bg-accent text-white hover:opacity-90" disabled={busy || listing.reason.trim().length === 0} onClick={() => void approve()}>
                              List guide
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setListing(null)}>Cancel</Button>
                          </span>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => setListing({ id: g.id, reason: "" })}>
                            Approve listing…
                          </Button>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-6">
                <SectionLabel>Listed guides ({live.length})</SectionLabel>
                {live.length === 0 ? (
                  <Card className="mt-2.5">
                    <p className="text-[12.5px] text-faint">Nobody is listed yet — approvals above put guides here.</p>
                  </Card>
                ) : (
                  <div className="mt-2.5 space-y-2">
                    {live.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => navigate(`/admin/guides/${g.id}`)}
                        className="flex w-full items-center gap-3.5 rounded-card bg-surface p-4 text-left shadow-soft transition-colors hover:bg-raised"
                      >
                        <Avatar name={g.name} size={38} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[13.5px] font-semibold text-ink">{g.name}</span>
                            {g.credentials_state === "checked" ? (
                              <Pill tone="green">documents checked</Pill>
                            ) : g.credentials_state === "expired" ? (
                              <Pill tone="red">certificate expired</Pill>
                            ) : (
                              <Pill tone="amber">not checked</Pill>
                            )}
                          </span>
                          <span className="mt-0.5 block truncate text-[12px] text-muted">
                            {g.headline ?? g.based_in ?? "No headline"}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11.5px] text-faint">since {formatDay(g.created_at)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          );
        }}
      </Resolve>
    </>
  );
}
