/**
 * Pipeline — the board the owner asked for: "who's interested, who booked, what
 * mountain/trek".
 *
 * One column per stage, one card per lead, and the three questions answerable
 * without opening anything: the stage is the column, the trip and its mountain
 * are on the card, and the mountain filter narrows the whole board to one peak.
 *
 * DELIBERATELY NO DRAG AND DROP. A board that looks draggable and is not is
 * worse than one that never invited the gesture — the operator pulls a card,
 * nothing happens, and they learn to distrust the screen. Stage changes go
 * through the card's ⋮ menu, which calls the backend and shows its refusal.
 *
 * Everything here is derived from rows that already exist. Nothing is counted
 * into a figure that ICEFALL claims as its own: leads the operator typed in
 * themselves carry `origin: "company"`, are marked as such on the card, and the
 * line above the board says plainly that they stay out of the Dashboard's
 * Icefall figures.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MessageSquare, Plus } from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  Notice,
  PageHeader,
  PersonAvatar,
  Pill,
  RowMenu,
  SearchInput,
  Tabs,
  Toolbar,
  VerifiedMark,
  formatMoney,
  type RowMenuItem,
} from "@/components/ui";
import {
  AddLeadDialog,
  BOARD_STAGES,
  OriginMark,
  STAGE_HINT,
  STAGE_LABEL,
  TagRow,
} from "@/components/leads";
import { NOW, timeAgo } from "@/domain/dates";
import { bookingValueReading, fold } from "@/domain/honesty";
import type { Booking, Lead, LeadStatus } from "@/domain/types";
import { useAsync, useOperator, useSession } from "@/state/OperatorContext";

/* -------------------------------------------------------------------------- */
/* The row model                                                              */
/* -------------------------------------------------------------------------- */

interface Entry {
  lead: Lead;
  /** The product's name, when one is chosen. */
  productName: string | null;
  /** The peak this enquiry is about — the lead's own, or its product's. */
  mountainId: string | null;
  mountainName: string | null;
  /** Everything the search box looks through, pre-lowered. */
  haystack: string;
}

/* -------------------------------------------------------------------------- */
/* One card                                                                   */
/* -------------------------------------------------------------------------- */

function LeadCard({
  entry,
  noteCount,
  booking,
}: {
  entry: Entry;
  /** Fetched once for the whole board — never per card. */
  noteCount: number | undefined;
  booking: Booking | null;
}) {
  const session = useSession();
  const { backend, refresh } = useOperator();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { lead } = entry;

  const move = async (status: LeadStatus) => {
    setError(null);
    const res = await backend.setLeadStatus(session, lead.id, status);
    if (!res.ok) {
      // The backend's own words. A refused move is a rule being explained.
      setError(res.reason);
      return;
    }
    refresh();
  };

  const items: RowMenuItem[] = [
    { label: "Open", onClick: () => navigate(`/operator/leads/${lead.id}`) },
    ...BOARD_STAGES.filter((s) => s !== lead.status).map((s) => ({
      label: `Move to ${STAGE_LABEL[s]}`,
      onClick: () => void move(s),
      tone: s === "lost" ? ("danger" as const) : ("neutral" as const),
    })),
  ];

  const trip = entry.productName ?? entry.mountainName;

  return (
    <Card className="relative p-3 transition-colors hover:bg-raised">
      {/*
        A stretched link rather than a click handler on the div: the card keeps
        real anchor semantics — focusable, middle-clickable, shown in the status
        bar — while the ⋮ menu sits above it and stays operable.
      */}
      <Link
        to={`/operator/leads/${lead.id}`}
        aria-label={`Open ${lead.customerName}`}
        className="absolute inset-0 rounded-card"
      />

      <div className="pointer-events-none relative space-y-2">
        <div className="flex items-center gap-2 pr-7">
          <PersonAvatar name={lead.customerName} size={26} />
          <span className="min-w-0 truncate text-[13px] font-medium text-ink">
            {lead.customerName}
          </span>
          <VerifiedMark name={lead.customerName} size={12} />
        </div>

        <p className={`truncate text-[11.5px] ${trip ? "text-muted" : "text-faint"}`} title={trip ?? undefined}>
          {trip ?? "No trip chosen yet"}
        </p>

        {/* "What mountain" answerable at a glance, once a trip is chosen. */}
        {entry.productName && entry.mountainName && (
          <div>
            <Pill>{entry.mountainName}</Pill>
          </div>
        )}

        <TagRow tags={lead.tags} max={3} />

        <OriginMark lead={lead} />

        {/*
          Booked cards carry the money, and only what was reported. A booking
          recorded without a value says so — never €0, which would understate
          the operator's own revenue in the screen they judge us by.
        */}
        {lead.status === "booked" && (
          <p className="text-[11.5px]">
            {booking ? (
              fold(
                bookingValueReading(booking.value),
                (cents) => (
                  <span className="tnum font-medium text-ink">
                    {formatMoney(cents, booking.currency)}
                  </span>
                ),
                (reason) => <span className="text-faint">{reason}</span>,
              )
            ) : (
              <span className="text-faint">No booking recorded against this lead</span>
            )}
          </p>
        )}

        <div className="flex items-center gap-2 text-[11px] text-faint">
          <span>{timeAgo(lead.createdAt, NOW)}</span>
          {noteCount !== undefined && noteCount > 0 && (
            <span className="inline-flex items-center gap-1" title={`${noteCount} internal note${noteCount === 1 ? "" : "s"}`}>
              <MessageSquare size={11} aria-hidden />
              <span className="tnum">{noteCount}</span>
            </span>
          )}
        </div>

        {error && <p className="text-[11.5px] leading-snug text-rejected">{error}</p>}
      </div>

      <div className="pointer-events-auto absolute top-2 right-1.5 z-10">
        <RowMenu items={items} label={`Actions for ${lead.customerName}`} />
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                 */
/* -------------------------------------------------------------------------- */

type OriginKey = "all" | "icefall" | "company";

export default function Pipeline() {
  const session = useSession();
  const { access, backend, mountains, revision } = useOperator();

  const leads = useAsync(() => backend.getLeads(session), [session, revision], []);
  const products = useAsync(() => backend.getProducts(session), [session, revision], []);
  const bookings = useAsync(() => backend.getBookings(session), [session, revision], []);

  /*
   * Notes are stored per lead, so the counts are read for the whole board in
   * ONE effect and memoised into a map. Reading them inside a card would fire a
   * request per card on every render and per keystroke in the search box.
   */
  const leadIdsKey = leads.map((l) => l.id).join(",");
  const noteCounts = useAsync(
    async () => {
      const pairs = await Promise.all(
        leads.map(async (l) => [l.id, (await backend.getLeadNotes(session, l.id)).length] as const),
      );
      return new Map<string, number>(pairs);
    },
    [session, revision, leadIdsKey],
    new Map<string, number>(),
  );

  /*
   * The dialog offers only the peaks this company may actually be placed on.
   * `mountains` is every peak in ICEFALL; offering one the backend will refuse
   * turns a rule the operator cannot see into an error they cannot predict.
   */
  const myMountains = useMemo(() => {
    const allowed = new Set(access.filter((a) => a.status === "active").map((a) => a.mountainId));
    return mountains.filter((m) => allowed.has(m.id));
  }, [access, mountains]);

  const [q, setQ] = useState("");
  const [origin, setOrigin] = useState<OriginKey>("all");
  const [mountainId, setMountainId] = useState("");
  const [adding, setAdding] = useState(false);

  const entries = useMemo<Entry[]>(() => {
    const productById = new Map(products.map((p) => [p.id, p]));
    const mountainById = new Map(mountains.map((m) => [m.id, m]));
    return leads.map((lead) => {
      const product = lead.productId ? (productById.get(lead.productId) ?? null) : null;
      const mtnId = lead.mountainId ?? product?.mountainIds[0] ?? null;
      const mountainName = mtnId ? (mountainById.get(mtnId)?.name ?? null) : null;
      return {
        lead,
        productName: product?.name ?? null,
        mountainId: mtnId,
        mountainName,
        haystack: [lead.customerName, product?.name ?? "", mountainName ?? "", ...lead.tags]
          .join(" ")
          .toLowerCase(),
      };
    });
  }, [leads, products, mountains]);

  /*
   * The mountain list is built from the leads themselves, not from every peak
   * the company is listed on: an option that can only ever show an empty board
   * is a filter that lies about having something behind it.
   */
  const mountainOptions = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const e of entries) {
      if (!e.mountainId || !e.mountainName) continue;
      const row = counts.get(e.mountainId);
      if (row) row.count += 1;
      else counts.set(e.mountainId, { name: e.mountainName, count: 1 });
    }
    return [...counts.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const needle = q.trim().toLowerCase();
  const matchesOrigin = (e: Entry) => (origin === "all" ? true : e.lead.origin === origin);
  const matchesMountain = (e: Entry) => mountainId === "" || e.mountainId === mountainId;
  const matchesSearch = (e: Entry) => needle === "" || e.haystack.includes(needle);
  const shown = entries.filter((e) => matchesOrigin(e) && matchesMountain(e) && matchesSearch(e));

  const originCount = (k: OriginKey) =>
    entries.filter((e) => (k === "all" ? true : e.lead.origin === k)).length;

  const fromIcefall = shown.filter((e) => e.lead.origin === "icefall").length;
  const addedByYou = shown.filter((e) => e.lead.origin === "company").length;

  const bookingByLead = useMemo(() => {
    const m = new Map<string, Booking>();
    for (const b of bookings) if (b.leadId) m.set(b.leadId, b);
    return m;
  }, [bookings]);

  const columns = BOARD_STAGES.map((stage) => ({
    stage,
    items: shown
      .filter((e) => e.lead.status === stage)
      .sort((a, b) => b.lead.createdAt.localeCompare(a.lead.createdAt)),
  }));

  /* A stage the board has no column for must not swallow leads silently. */
  const offBoard = shown.filter((e) => !BOARD_STAGES.includes(e.lead.status)).length;

  return (
    <>
      <PageHeader
        title="Pipeline"
        detail="Every lead you are working, by stage."
        action={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus size={14} aria-hidden />
            Add lead
          </Button>
        }
      />

      {adding && (
        <AddLeadDialog products={products} mountains={myMountains} onClose={() => setAdding(false)} />
      )}

      {entries.length === 0 ? (
        <EmptyState
          title="No leads yet"
          detail="Enquiries that reach you through Icefall land here automatically. You can also add one you got yourself."
        />
      ) : (
        <>
          <Toolbar search={<SearchInput value={q} onChange={setQ} placeholder="Search leads..." />}>
            <Tabs
              active={origin}
              onChange={setOrigin}
              tabs={[
                { key: "all" as const, label: "All", count: originCount("all") },
                { key: "icefall" as const, label: "Icefall", count: originCount("icefall") },
                { key: "company" as const, label: "Added by you", count: originCount("company") },
              ]}
            />
            <label className="sr-only" htmlFor="pipeline-mountain">
              Filter by mountain
            </label>
            <select
              id="pipeline-mountain"
              value={mountainId}
              onChange={(e) => setMountainId(e.target.value)}
              className="rounded-tile border border-line bg-elevated px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-azure"
            >
              <option value="">All mountains</option>
              {mountainOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.count})
                </option>
              ))}
            </select>
          </Toolbar>

          {/* The split, counted from the rows on the board — not a stored total. */}
          <div className="mb-4">
            <p className="text-[12.5px] text-muted">
              <span className="tnum">{fromIcefall}</span> from Icefall ·{" "}
              <span className="tnum">{addedByYou}</span> added by you
            </p>
            {addedByYou > 0 && (
              <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-faint">
                Leads you added yourself are not counted in the Icefall enquiry and booking figures
                on the Dashboard.
              </p>
            )}
          </div>

          {offBoard > 0 && (
            <div className="mb-4">
              <Notice>
                {offBoard === 1
                  ? "1 lead is with Icefall for review and has no column here."
                  : `${offBoard} leads are with Icefall for review and have no column here.`}
              </Notice>
            </div>
          )}

          {shown.length === 0 ? (
            <EmptyState title="No matches" detail="Nothing in your pipeline matches these filters." />
          ) : (
            /*
              The board scrolls sideways inside this container so the PAGE never
              does. The tall bottom padding is not decoration: `overflow-x` makes
              the vertical axis clip too, and a card's ⋮ menu opens downward.
            */
            <div className="-mx-1 overflow-x-auto px-1 pb-24">
              <div className="flex min-w-max items-start gap-3">
                {columns.map(({ stage, items }) => (
                  <div key={stage} className="w-[260px] shrink-0">
                    <div
                      title={STAGE_HINT[stage]}
                      className="mb-2 flex items-center gap-2 border-b border-line-soft pb-2"
                    >
                      <span className="lbl">{STAGE_LABEL[stage]}</span>
                      <span className="tnum ml-auto text-[11.5px] font-medium text-faint">
                        {items.length}
                      </span>
                    </div>

                    {items.length === 0 ? (
                      <div className="rounded-card border border-dashed border-line px-3 py-5 text-center text-[11.5px] leading-snug text-faint">
                        {STAGE_HINT[stage]}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {items.map((e) => (
                          <LeadCard
                            key={e.lead.id}
                            entry={e}
                            noteCount={noteCounts.get(e.lead.id)}
                            booking={bookingByLead.get(e.lead.id) ?? null}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
