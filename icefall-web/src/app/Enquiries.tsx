import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Eye, Mail, Send } from "lucide-react";
import { supabase } from "@/backend/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

/**
 * My enquiries — what I asked, and what has actually happened to it.
 *
 * ── THE STATE IS DERIVED FROM TIMESTAMPS, NEVER FROM A STATUS COLUMN ────────
 *
 * The table carries `created_at`, `seen_at` and `answered_at` and no status
 * field, deliberately: a status can drift from the facts, and "seen" can never
 * be un-seen because a trigger refuses to unset it. So this screen computes the
 * state from what is recorded and can therefore only ever show something true.
 *
 * **Three states, because three are what exist.** Sent. Seen. Answered. There is
 * no "in progress", no "assigned", no "being looked at" — nothing records those,
 * so nothing may claim them. And there is **no estimate of when a reply will
 * come**: `first_response_at` has never been populated across the whole product,
 * so there is no honest number to give, and inventing a comforting one is the
 * exact failure the enquiry contract's rule 3 exists to prevent.
 *
 * ── WHY A SIGNED-OUT VISITOR'S ENQUIRIES ARE NOT HERE ───────────────────────
 *
 * RLS allows a sender to read `sender_id = auth.uid()`, and the anonymous insert
 * path forces `sender_id` to null — so an enquiry sent while signed out is, by
 * construction, unreadable afterwards even by the person who wrote it. That is
 * not a gap this screen can close by trying harder; it is what anonymity costs,
 * and the empty state says so rather than implying the enquiry was lost.
 */

interface Row {
  id: string;
  created_at: string;
  object_label: string;
  body: string;
  seen_at: string | null;
  answered_at: string | null;
  answer: string | null;
}

type Load = { state: "loading" } | { state: "ok"; rows: Row[] } | { state: "error"; message: string };

export default function Enquiries() {
  const { session, signedIn, ready } = useAuth();
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    if (!ready) return;
    if (!supabase) {
      setLoad({ state: "error", message: "ICEFALL can't reach the server from here." });
      return;
    }
    if (!signedIn) {
      setLoad({ state: "ok", rows: [] });
      return;
    }
    let alive = true;
    supabase
      .from("enquiries")
      .select("id, created_at, object_label, body, seen_at, answered_at, answer")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!alive) return;
        // A read failure is a read failure — it is not "you have no enquiries".
        // Showing an empty list here would tell somebody their question never
        // existed, which is a worse lie than an error message.
        if (error) setLoad({ state: "error", message: "We couldn't load your enquiries just now." });
        else setLoad({ state: "ok", rows: (data ?? []) as Row[] });
      });
    return () => {
      alive = false;
    };
  }, [ready, signedIn, session?.id]);

  return (
    <div className="mx-auto w-full max-w-[860px] pb-16">
      <h1 className="text-[24px] font-light tracking-[-0.02em] text-snow">My enquiries</h1>
      <p className="mt-1.5 text-[13px] text-mist">
        What you asked, and what has happened to it since.
      </p>

      {load.state === "loading" && (
        <p className="mt-8 text-[13px] text-mist-dim">Loading…</p>
      )}

      {load.state === "error" && (
        <div className="mt-6 rounded-card border border-hairline bg-graphite p-6">
          <p className="text-[13px] text-mist">{load.message}</p>
          <p className="mt-1.5 text-[12px] text-mist-dim">
            Nothing is lost — this is a problem reading them, not with the enquiries themselves.
          </p>
        </div>
      )}

      {load.state === "ok" && load.rows.length === 0 && (
        <div className="mt-6 rounded-card border border-hairline bg-graphite p-6">
          <p className="text-[13px] text-mist">Nothing here yet.</p>
          <p className="mt-1.5 max-w-[62ch] text-[12px] leading-relaxed text-mist-dim">
            Enquiries you send while signed in appear here with their real state.{" "}
            {/*
              Stated plainly rather than left as a mystery. Somebody who wrote to
              us before signing in and finds this empty would otherwise conclude
              their question vanished.
            */}
            Anything you sent before signing in is not shown — those are sent
            anonymously, and the answer goes to the address you gave rather than to an account.
          </p>
          <Link
            to="/app/treks"
            className="mt-4 inline-block text-[12.5px] text-azure hover:text-azure-bright"
          >
            Browse the treks
          </Link>
        </div>
      )}

      {load.state === "ok" && load.rows.length > 0 && (
        <ol className="mt-6 space-y-4">
          {load.rows.map((r) => (
            <EnquiryCard key={r.id} row={r} />
          ))}
        </ol>
      )}
    </div>
  );
}

function EnquiryCard({ row }: { row: Row }) {
  const state = row.answered_at ? "answered" : row.seen_at ? "seen" : "sent";

  return (
    <li className="rounded-card border border-hairline bg-graphite p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[14px] text-snow">{row.object_label}</p>
        <p className="tnum text-[11.5px] text-mist-dim">{when(row.created_at)}</p>
      </div>

      <p className="mt-2.5 whitespace-pre-line text-[12.5px] leading-relaxed text-mist">{row.body}</p>

      <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
        <Step icon={Send} label="Sent" at={row.created_at} done />
        <Step icon={Eye} label="Seen" at={row.seen_at} done={Boolean(row.seen_at)} />
        <Step icon={CheckCircle2} label="Answered" at={row.answered_at} done={Boolean(row.answered_at)} />
      </div>

      {state === "answered" && row.answer && (
        <div className="mt-3.5 rounded-tile border border-azure/25 bg-azure/[0.06] p-3.5">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-azure">
            <Mail size={12} strokeWidth={1.9} />
            ICEFALL replied
          </p>
          <p className="mt-2 whitespace-pre-line text-[12.5px] leading-relaxed text-snow">{row.answer}</p>
        </div>
      )}
    </li>
  );
}

/**
 * One step of the lifecycle.
 *
 * A step that has not happened is shown greyed WITHOUT a date and without a
 * guess at when it will — the absence is the information. It is not a progress
 * bar, because a progress bar implies a rate, and nothing here has one.
 */
function Step({
  icon: Icon,
  label,
  at,
  done,
}: {
  icon: typeof Send;
  label: string;
  at: string | null;
  done: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11px]",
        done ? "border-azure/35 text-snow" : "border-hairline text-mist-dim",
      )}
    >
      <Icon size={11} strokeWidth={1.9} className={done ? "text-azure" : "text-mist-dim"} />
      {label}
      {done && at && <span className="tnum text-mist-dim">· {when(at)}</span>}
    </span>
  );
}

/** A date somebody can check against their own memory — never "2 days ago". */
function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
