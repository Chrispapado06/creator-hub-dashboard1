import { Link, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { Card } from "@/components/ui/primitives";
import { PersonAvatar } from "@/components/Photo";
import { inputClass } from "@/components/guide";
import { conversations, stagedBookings } from "@/domain/season";
import { clientById, fmtRange, fmtWhen } from "@/data/demo";

/** One client — what they have climbed with this guide, and what was said. */
export default function ClientDetail() {
  const { id } = useParams();
  const c = id ? clientById(id) : undefined;
  const trips = stagedBookings().filter((b) => id !== undefined && b.clientIds.includes(id));
  const threads = conversations().filter((t) => id !== undefined && t.clientIds.includes(id));

  if (!c) {
    return (
      <Screen>
        <div className="pt-8">
          <Link to="/clients" className="inline-flex items-center gap-1 text-[12.5px] text-mist">
            <ChevronLeft size={16} strokeWidth={1.7} /> Clients
          </Link>
          <Card className="mt-5">
            <p className="text-[12.5px] text-mist">That client is not on this device.</p>
          </Card>
        </div>
      </Screen>
    );
  }

  const last = trips
    .filter((t) => t.state === "complete")
    .sort((a, b) => +new Date(b.departureIso) - +new Date(a.departureIso))[0];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5">
        <Stagger>
          <Rise className="flex items-center gap-3 pb-4 pt-7">
            <Link to="/clients" aria-label="Back" className="-ml-1 text-mist">
              <ChevronLeft size={22} strokeWidth={1.7} />
            </Link>
            <PersonAvatar name={c.name} size={34} online={c.online} />
            <div className="min-w-0">
              <p className="truncate text-[15px] text-snow">{c.name}</p>
              <p className="text-[11px] text-mist-dim">Client</p>
            </div>
          </Rise>

          <Rise className="flex justify-center pt-2">
            <PersonAvatar name={c.name} size={76} online={c.online} />
          </Rise>

          <Rise className="pt-5">
            <Card inset={false}>
              <dl className="divide-y divide-hairline">
                <Row label="Email" value={c.email} />
                <Row label="Phone" value={c.phone} />
                <Row label="From" value={c.from} />
                <Row label="Total trips" value={String(trips.length)} />
                <Row
                  label="Last trip"
                  value={
                    last ? `${last.title} · ${fmtRange(last.from, last.to)}` : "None completed yet"
                  }
                />
                <Row label="Notes" value={c.notes} />
              </dl>
            </Card>
          </Rise>

          <Rise className="pb-3 pt-6">
            <div className="flex items-baseline justify-between">
              <p className="section-label">Recent conversations</p>
              <Link to="/chat" className="text-[11.5px] text-azure">
                View all
              </Link>
            </div>
            <div className="mt-3 space-y-2.5">
              {threads.map((t) => (
                <Link key={t.id} to={`/chat/${t.id}`} className="block">
                  <Card className="transition-colors hover:border-hairline-strong">
                    <p className="text-[12.5px] leading-relaxed text-mist">
                      {t.last?.voiceSeconds !== undefined ? "Voice message" : t.last?.body}
                    </p>
                    <p className="tnum mt-1.5 text-[11px] text-mist-dim">
                      {t.last ? fmtWhen(t.last.at) : ""}
                    </p>
                  </Card>
                </Link>
              ))}
              {threads.length === 0 && (
                <Card>
                  <p className="py-3 text-center text-[12.5px] text-mist-dim">Nothing said yet.</p>
                </Card>
              )}
            </div>
          </Rise>
        </Stagger>
      </div>

      <div className="shrink-0 border-t border-hairline px-5 pb-4 pt-3">
        <input
          disabled
          placeholder={`Message ${c.name.split(" ")[0]}…`}
          className={`${inputClass} disabled:opacity-60`}
        />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="shrink-0 text-[12px] text-mist-dim">{label}</dt>
      <dd className="min-w-0 text-right text-[12.5px] leading-relaxed text-snow">{value}</dd>
    </div>
  );
}
