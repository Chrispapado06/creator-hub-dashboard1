import { useState } from "react";
import { Footprints, Mountain, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui";
import { DEMO_NOTICE, IS_DEMO, monogram } from "@/data/demo";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

/**
 * The athlete's own record.
 *
 * ── WHY THERE IS NO DEMO ATHLETE ────────────────────────────────────────────
 *
 * Every other page gates invented content behind `IS_DEMO`. This one has none
 * to gate. Demo guides and demo expeditions are obviously other people's; a demo
 * summit on your own profile reads as yours, and the first thing someone would
 * do with a screenshot of it is show somebody. So the summits table is empty in
 * development and in production, for the same reason: nothing has been climbed.
 *
 * ── EVERY FIGURE IS AN EM-DASH ──────────────────────────────────────────────
 *
 * Total ascent, highest point, days above 4,000 m — all of it comes from
 * activities recorded on the phone, and this app deliberately records none. A
 * zero would be a measurement that came back empty; a "—" is an absence, and the
 * difference matters when the number will be read as readiness for altitude.
 *
 * Recording needs the sensors in your pocket (GPS, barometer, the accelerometer
 * that knows when you stopped). This app plans, reads and books. There is also
 * no field to type a summit into by hand: an entry anyone can write is worth
 * nothing to the guide reading it, so the Evidence column will only ever hold a
 * recorded track. ICEFALL never puts a tick against a summit — the tick in this
 * app means one thing, that staff read a document on a date.
 *
 * ── AND NO EDIT / EXPORT / SHARE ────────────────────────────────────────────
 *
 * Those buttons all need a server. There isn't one, so they are not here rather
 * than here-and-inert. Session data lives in this browser under a single key and
 * is never transmitted; clearing the browser is the delete. Free is likewise the
 * only plan — premium is designed but not sold, and no payment processor is
 * connected, so nothing here can charge anyone.
 *
 * ── TEXT BUDGET (2026-08 tightening pass) ───────────────────────────────────
 *
 * The page used to carry sixteen small grey paragraphs saying the above in the
 * UI. It now carries two blocks: one line under the tab bar, and DEMO_NOTICE at
 * the foot. Everything else that had to survive became a label — "None stored",
 * "Nobody", "None yet", "—". Reasoning belongs in this comment, not on screen.
 */

type Tab = "summits" | "activities" | "stats";

const TABS: { id: Tab; label: string; icon: typeof Mountain }[] = [
  { id: "summits", label: "Summits", icon: Mountain },
  { id: "activities", label: "Activities", icon: Footprints },
  { id: "stats", label: "Stats", icon: TrendingUp },
];

/**
 * A record number the browser derives from the email, so the same person sees
 * the same number every visit. Nobody issued it, it is not unique, and no
 * register anywhere can be asked about it — which is what the passport's
 * "Issued by · Nobody" row says in three words instead of a paragraph.
 */
function recordNumber(email: string): string {
  let h = 2166136261;
  for (let i = 0; i < email.length; i += 1) {
    h ^= email.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const n = (h >>> 0).toString(36).toUpperCase().padStart(7, "0");
  return `IF-${n.slice(0, 4)}-${n.slice(4)}`;
}

function handleFor(name: string): string | null {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return slug.length > 0 ? `@${slug}` : null;
}

export default function Profile() {
  const { session } = useAuth();
  const [tab, setTab] = useState<Tab>("summits");

  const handle = session ? handleFor(session.name) : null;

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <h1 className="text-[24px] font-light tracking-[-0.02em] text-snow">Profile</h1>

      {/* Above the fold: identity, what is stored, the passport. No prose. */}
      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="min-w-0">
          <section className="rounded-card border border-hairline bg-graphite p-6">
            <div className="flex items-start gap-5">
              <span className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-full border border-hairline bg-elevated/60 text-[22px] font-light tracking-[0.05em] text-mist">
                {monogram(session?.name ?? "")}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[21px] font-light tracking-[-0.02em] text-snow">
                  {session?.name ?? "No bearer"}
                </h2>
                <p className="mt-1 truncate text-[12.5px] text-mist-dim">
                  {handle ?? "No session"}
                </p>
                <div className="mt-3.5 flex flex-wrap items-center gap-2">
                  <Badge tone="azure">Free plan</Badge>
                  <Badge>Unverified record</Badge>
                </div>
              </div>
            </div>
          </section>

          {/* The whole of what ICEFALL holds, as label/value rows. */}
          <section className="mt-5 rounded-card border border-hairline bg-graphite p-5">
            <p className="section-label">What ICEFALL holds about you</p>
            <dl className="mt-4 divide-y divide-hairline">
              <Held label="Name" value={session?.name ?? "—"} />
              <Held label="Email" value={session?.email ?? "—"} />
              <Held label="Password" value="None stored" />
              <Held label="Location history" value="None" />
              <Held label="Stored" value="This browser only" />
              <Held label="Plan" value="Free · the only plan" />
              <Held label="Everything else" value="Nothing" />
            </dl>
          </section>
        </div>

        <Passport name={session?.name ?? null} email={session?.email ?? null} />
      </div>

      {/* ---- Summits / Activities / Stats --------------------------------- */}
      <div className="mt-8 flex gap-1 border-b border-hairline">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-[13px] transition-colors",
              tab === t.id
                ? "border-azure text-snow"
                : "border-transparent text-mist hover:text-snow",
            )}
          >
            <t.icon size={15} strokeWidth={1.7} className={tab === t.id ? "text-azure" : ""} />
            {t.label}
            {/* A true zero, unlike everything in Stats — nothing recorded is a count, not a measurement. */}
            <span className="tnum text-[11px] text-mist-dim">0</span>
          </button>
        ))}
      </div>

      {/*
        EXPLANATORY BLOCK 1 OF 2. One line covering all three tabs: why the table
        is empty, why there is no "add" control, and why the figures are dashes.
        Do not re-explain any of that inside the panels below.
      */}
      <p className="mt-3 text-[11.5px] text-mist-dim">
        Summits, activities and figures fill from ascents recorded in the phone app.
      </p>

      {tab === "summits" && <Summits />}
      {tab === "activities" && <Activities />}
      {tab === "stats" && <Stats />}

      {/* EXPLANATORY BLOCK 2 OF 2, at the foot, as on every other page. */}
      {IS_DEMO && (
        <p className="mt-8 border-l-2 border-azure/30 pl-4 text-[11px] leading-relaxed text-mist-dim">
          {DEMO_NOTICE}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Passport                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A cream document on a black page — the one light surface in the app.
 *
 * Styled as a field record rather than a state passport on purpose: an
 * unverified document that borrows the visual authority of a real one is a
 * forgery-shaped design. Hence the dashed stamp boxes, the empty bearer photo,
 * and a STATUS line that is the largest thing on the card after the title.
 *
 * The two rows under STATUS replace two paragraphs. A stamp is meant to be given
 * by someone who was there — a guide, a company, a hut warden — and none of them
 * can reach this app yet, so nobody can issue one and this page will not print
 * one. "Issued by · Nobody" and "Verified by · Nobody" say that in four words.
 */
function Passport({ name, email }: { name: string | null; email: string | null }) {
  return (
    <aside className="h-fit rounded-card border border-hairline bg-[#EDE9E1] p-6 text-[#1a1a1a]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[9.5px] font-medium uppercase tracking-[0.3em] text-[#1a1a1a]/50">
            ICEFALL
          </p>
          <p className="mt-2 text-[20px] font-light tracking-[-0.015em]">Mountain passport</p>
        </div>
        <Mountain size={24} strokeWidth={1.3} className="mt-1 shrink-0 text-[#1a1a1a]/30" />
      </div>

      <div className="mt-5 flex gap-5 border-t border-[#1a1a1a]/15 pt-5">
        <span className="grid h-[92px] w-[70px] shrink-0 place-items-center border border-dashed border-[#1a1a1a]/30 bg-[#E2DDD2] text-[19px] font-light tracking-[0.06em] text-[#1a1a1a]/40">
          {monogram(name ?? "")}
        </span>
        <dl className="min-w-0 flex-1 space-y-3.5">
          <PassportField label="Bearer" value={name ?? "—"} />
          <PassportField
            label="Record number"
            value={email !== null ? recordNumber(email) : "—"}
            mono
          />
          {/* Would be the date an account was created. There are no accounts. */}
          <PassportField label="Record opened" value="—" />
        </dl>
      </div>

      <div className="mt-6 flex items-baseline justify-between gap-4">
        <p className="text-[9.5px] font-medium uppercase tracking-[0.22em] text-[#1a1a1a]/50">
          Summit stamps
        </p>
        <p className="text-[10.5px] text-[#1a1a1a]/55">None yet</p>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            aria-hidden
            className="aspect-square rounded-full border border-dashed border-[#1a1a1a]/22"
          />
        ))}
      </div>

      <div className="mt-6 border-t border-[#1a1a1a]/15 pt-4">
        <p className="text-[9.5px] font-medium uppercase tracking-[0.22em] text-[#1a1a1a]/50">
          Status
        </p>
        <p className="tnum mt-2 text-[14px] tracking-[0.04em]">USER RECORD · UNVERIFIED</p>
        <dl className="mt-3 space-y-2 border-t border-[#1a1a1a]/15 pt-3">
          <PassportRow label="Issued by" value="Nobody" />
          <PassportRow label="Verified by" value="Nobody" />
        </dl>
      </div>
    </aside>
  );
}

function PassportField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[9.5px] font-medium uppercase tracking-[0.22em] text-[#1a1a1a]/50">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 truncate text-[15px] font-light",
          mono === true && "tnum tracking-[0.06em]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function PassportRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[10.5px] text-[#1a1a1a]/55">{label}</dt>
      <dd className="text-[10.5px] text-[#1a1a1a]/80">{value}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tabs                                                                       */
/* -------------------------------------------------------------------------- */

function Summits() {
  return (
    <section className="mt-4">
      {/*
        The header row is rendered over an empty body rather than replaced by an
        illustration. Someone deciding whether to keep their log here should be
        able to see exactly which columns ICEFALL would hold before they climb
        anything. Evidence = the recorded track, never a tick.
      */}
      <div className="overflow-x-auto rounded-card border border-hairline bg-graphite">
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="border-b border-hairline">
              <th className="section-label px-5 py-3.5 font-medium">Peak</th>
              <th className="section-label px-5 py-3.5 font-medium">Height</th>
              <th className="section-label px-5 py-3.5 font-medium">Route</th>
              <th className="section-label px-5 py-3.5 font-medium">Date</th>
              <th className="section-label px-5 py-3.5 font-medium">Evidence</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={5} className="px-5 py-16 text-center">
                <Mountain size={22} strokeWidth={1.4} className="mx-auto text-mist-dim" />
                <p className="mt-3.5 text-[14px] text-snow">No summits recorded</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Activities() {
  return (
    <section className="mt-4 rounded-card border border-hairline bg-graphite px-5 py-16 text-center">
      <Footprints size={22} strokeWidth={1.4} className="mx-auto text-mist-dim" />
      <p className="mt-3.5 text-[14px] text-snow">Nothing recorded</p>
    </section>
  );
}

function Stats() {
  // Six dashes, never six zeroes. The per-tile captions that used to explain
  // what each figure would hold are gone: the labels say it on their own.
  return (
    <section className="mt-4">
      <div className="grid gap-px overflow-hidden rounded-card border border-hairline bg-hairline sm:grid-cols-2 xl:grid-cols-3">
        <Figure label="Total ascent" />
        <Figure label="Highest point" />
        <Figure label="Days above 4,000 m" />
        <Figure label="Longest day" />
        <Figure label="Training hours" />
        <Figure label="Summits" />
      </div>
    </section>
  );
}

function Figure({ label }: { label: string }) {
  return (
    <div className="bg-graphite p-5">
      <p className="tnum text-[28px] font-light leading-none text-mist-dim">—</p>
      <p className="mt-3 text-[13px] text-snow">{label}</p>
    </div>
  );
}

function Held({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2.5 first:pt-0 last:pb-0">
      <dt className="shrink-0 text-[12.5px] text-mist">{label}</dt>
      <dd className="truncate text-[12.5px] text-snow">{value}</dd>
    </div>
  );
}
