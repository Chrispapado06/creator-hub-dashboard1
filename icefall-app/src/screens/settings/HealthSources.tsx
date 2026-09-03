import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Check, Circle, Loader2, ShieldQuestion } from "lucide-react";
import { SettingsPage } from "@/components/settings/kit";
import { AzureNotice, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Rise } from "@/components/layout/chrome";
import { cn } from "@/lib/utils";
import {
  readHealthConsent,
  recordHealthConsent,
  wordingInForce,
  type ConsentWording,
  type HealthConsent,
} from "@/health/consent";
import {
  OURA_MEASUREMENTS,
  OURA_METRICS,
  OURA_SCORES,
  OURA_UNAVAILABLE_COPY,
  ouraService,
  type OuraMetricId,
  type OuraReading,
  type OuraState,
  type OuraSummary,
} from "@/tracking/sources/oura";

/**
 * Ring and health data — permission, connection, and what is actually stored.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ORDER OF THIS SCREEN IS THE LAW IT ENFORCES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Permission first, connection second, measurements third. Not a layout
 * preference: a person cannot reach the Connect button until they have granted
 * a permission whose sentence they have read, because the server refuses to
 * issue an authorize URL without it and this screen refuses to offer one.
 *
 * The sentence is FETCHED, not written here. `health_record_consent` stamps
 * each decision with the wording version in force at the moment of the write,
 * so a hardcoded paragraph in this file could drift and record somebody's
 * agreement against words they were never shown. If the wording cannot be
 * fetched, THERE IS NO GRANT BUTTON — the screen says it cannot ask right now.
 * An unevidenced tick is worse than no tick.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IS RENDERED WHERE THERE IS NO NUMBER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * An em dash and the reason. Never a zero, never a blank, and never the last
 * value we happened to hold. Three separate cases are kept apart on purpose:
 *
 *   no-data          the ring was worn and did not record this
 *   no-recent-data   the newest reading is older than the freshness window —
 *                    an unsynced ring, or a webhook subscription that expired
 *                    quietly. Shown as "too old to be today's", never as today's.
 *   everything else  the connection itself is not working, in the words of the
 *                    specific fault
 *
 * And when a refresh fails while older values are still held, the card says
 * when they were read. A value with its own timestamp beside it is a reading; a
 * value without one is a claim about now.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MEASUREMENTS AND SCORES ARE NOT MIXED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Two blocks, never interleaved. Oura's `resting_heart_rate` CONTRIBUTOR is a
 * 0-100 score and not a pulse; a good resting heart rate scores near 100. Put
 * next to a real bpm figure in one grid, somebody reads 97 as a heart rate. The
 * metric table carries `kind` and this screen renders on it.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS SCREEN DOES NOT CLAIM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Disconnecting deletes ICEFALL's copy and forgets our tokens. IT DOES NOT
 * REVOKE ANYTHING AT OURA. Oura publishes no revocation endpoint, so the server
 * returns a sentence saying so and this screen prints that sentence verbatim.
 * Reporting a revocation we did not perform is the same class of failure as
 * printing a measurement we did not take.
 */

export default function HealthSources() {
  const [params, setParams] = useSearchParams();

  const [state, setState] = useState<OuraState>(ouraService.state);
  const [summary, setSummary] = useState<OuraSummary>(ouraService.summary());
  const [consent, setConsent] = useState<HealthConsent | null>(null);
  const [wording, setWording] = useState<ConsentWording | null>(null);
  const [wordingChecked, setWordingChecked] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revocation, setRevocation] = useState<string | null>(null);

  useEffect(
    () =>
      ouraService.subscribe((s) => {
        setState(s);
        setSummary(ouraService.summary());
      }),
    [],
  );

  const reloadConsent = useCallback(async () => {
    const [c, w] = await Promise.all([readHealthConsent(), wordingInForce()]);
    setConsent(c);
    setWording(w);
    setWordingChecked(true);
  }, []);

  useEffect(() => {
    void reloadConsent();
    void ouraService.refresh();
  }, [reloadConsent]);

  /*
    The return leg of the OAuth flow. The server has already exchanged the code
    server-side and put nothing in this URL but a word: no token, no Oura id, no
    health value ever travels in a query string.

    `oura=error` carries Oura's own refusal code. `access_denied` means the
    person pressed Cancel on Oura's page, which is not an error and is not
    apologised for.
  */
  useEffect(() => {
    const outcome = params.get("oura");
    if (!outcome) return;

    if (outcome === "error") {
      const reason = params.get("reason") || "";
      setError(
        reason === "access_denied"
          ? "You cancelled on Oura's page, so nothing was connected."
          : `Connecting your ring did not complete${reason ? ` (${reason})` : ""}. Nothing was stored.`,
      );
    }

    const next = new URLSearchParams(params);
    next.delete("oura");
    next.delete("reason");
    setParams(next, { replace: true });
    void ouraService.refresh();
  }, [params, setParams]);

  const granted = consent?.status === "granted";

  async function decide(decision: "granted" | "declined" | "withdrawn") {
    setWorking(true);
    setError(null);
    setRevocation(null);
    const res = await recordHealthConsent(
      decision,
      decision === "withdrawn" ? "app-disconnect" : "app-settings",
    );
    if (!res.ok) setError(res.error ?? null);
    await reloadConsent();
    await ouraService.refresh();
    setWorking(false);
  }

  async function connect() {
    setWorking(true);
    setError(null);
    const res = await ouraService.connect();
    if (!res.ok || !res.url) {
      setError(res.error ?? "The connection could not be started.");
      setWorking(false);
      return;
    }
    /*
      A full navigation, not a popup. Oura's page is where somebody types their
      Oura password, and it must be in a real browser address bar they can
      inspect. A native shell replaces this line with a system browser or an
      in-app auth session and hears the result back through its own universal
      link — the return address is allowlisted on the server, so nothing here
      changes to accommodate it.
    */
    window.location.assign(res.url);
  }

  async function disconnect() {
    setWorking(true);
    setError(null);
    setRevocation(null);
    const res = await ouraService.disconnect();
    if (!res.ok) setError(res.error ?? null);
    else if (res.revocation) setRevocation(res.revocation.message);
    await reloadConsent();
    setWorking(false);
  }

  return (
    <SettingsPage
      title="Ring and health data"
      subtitle="What ICEFALL stores, and your permission for it"
    >
      {error && (
        <Rise className="pt-5">
          <Card className="border-danger/40 bg-danger/[0.05]">
            <div className="flex items-start gap-3">
              <AlertTriangle size={16} strokeWidth={1.6} className="mt-px shrink-0 text-danger" />
              <p className="text-[12.5px] leading-relaxed text-snow/90">{error}</p>
            </div>
          </Card>
        </Rise>
      )}

      {/* 1 — permission. Nothing below is reachable without it. */}
      <Rise className="pt-5">
        <SectionLabel>Permission</SectionLabel>
        <ConsentBlock
          consent={consent}
          wording={wording}
          wordingChecked={wordingChecked}
          busy={working}
          onDecide={decide}
        />
      </Rise>

      {/* 2 — the connection itself. */}
      <Rise className="pt-6">
        <SectionLabel>Oura ring</SectionLabel>
        <Card className="mt-3">
          <ConnectionSummary state={state} />

          {granted && (
            <div className="mt-4 space-y-2.5">
              {(state.status === "disconnected" || state.status === "attention") && (
                <Button className="w-full" disabled={working} onClick={connect}>
                  {working ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : state.status === "attention" ? (
                    "Connect again"
                  ) : (
                    "Connect Oura ring"
                  )}
                </Button>
              )}
              {(state.status === "connected" || state.status === "attention") && (
                <Button
                  variant="danger"
                  className="w-full"
                  disabled={working}
                  onClick={disconnect}
                >
                  Disconnect and delete my ring data
                </Button>
              )}
            </div>
          )}
        </Card>

        {revocation && (
          /* Verbatim. A refusal is not paraphrased and not softened. */
          <AzureNotice title="What was and was not done" className="mt-3">
            <p>{revocation}</p>
            <p className="text-mist-dim">Oura app → Settings → Account → Connected apps</p>
          </AzureNotice>
        )}
      </Rise>

      {/* 3 — the numbers, only once there is a live connection. */}
      {state.status === "connected" && (
        <>
          {state.refreshError && (
            <Rise className="pt-6">
              <Card className="border-hairline-strong">
                <p className="text-[12px] leading-relaxed text-mist">
                  {state.refreshError}
                  {state.lastFetchAt
                    ? ` These readings were fetched at ${new Date(state.lastFetchAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.`
                    : ""}
                </p>
              </Card>
            </Rise>
          )}

          <Rise className="pt-6">
            <SectionLabel>Measurements</SectionLabel>
            <Card className="mt-3" inset={false}>
              <div className="px-4">
                {OURA_MEASUREMENTS.map((id) => (
                  <ReadingRow key={id} id={id} reading={summary.metrics[id]} />
                ))}
              </div>
            </Card>
            <Disclaimer className="mt-3">
              Every figure above is a measurement from the ring, with the night or day it belongs
              to. Where there is no reading there is a dash and the reason — nothing is estimated,
              carried over from an earlier day, or filled in with a zero.
            </Disclaimer>
          </Rise>

          <Rise className="pt-6">
            <SectionLabel>Oura's own scores</SectionLabel>
            <Card className="mt-3" inset={false}>
              <div className="px-4">
                {OURA_SCORES.map((id) => (
                  <ReadingRow key={id} id={id} reading={summary.metrics[id]} />
                ))}
              </div>
            </Card>
            <Disclaimer className="mt-3">
              These are Oura's 0-100 opinions, not measurements and not ICEFALL's readiness.
              "Resting HR balance" in particular is a score out of 100 and not a heart rate — the
              heart rate in beats per minute is in the block above.
            </Disclaimer>
          </Rise>

          <ContextNote summary={summary} />
        </>
      )}

      {/*
        THE RETENTION PERIOD IS NOT RESTATED HERE, AND THAT IS DELIBERATE.

        The consent wording above is the one place it is promised, because that
        sentence is stored in the database, frozen against each decision, and
        changed only by issuing a new version and asking everybody again. A
        second copy of "400 days" in this file would be a promise that can drift
        from the one people actually agreed to.

        There is also a real gap to be honest about: retention pruning runs
        opportunistically rather than on a schedule, so 400 days is what usually
        happens and not yet a guarantee. Repeating it here as a flat statement of
        fact would be this screen claiming something the code does not keep.

        Disconnection is different. It deletes synchronously and the server
        reports what it removed, so it IS stated.
      */}
      <Rise className="pt-6">
        <Disclaimer>
          ICEFALL reads your Oura data; it never writes to it. Disconnecting deletes every
          measurement ICEFALL holds and forgets its access to your Oura account — but it cannot
          cancel the permission at Oura's end, which you do in the Oura app.
        </Disclaimer>
      </Rise>
    </SettingsPage>
  );
}

/* -------------------------------------------------------------------------- */
/* Permission                                                                 */
/* -------------------------------------------------------------------------- */

function ConsentBlock({
  consent,
  wording,
  wordingChecked,
  busy,
  onDecide,
}: {
  consent: HealthConsent | null;
  wording: ConsentWording | null;
  wordingChecked: boolean;
  busy: boolean;
  onDecide: (d: "granted" | "declined" | "withdrawn") => void;
}) {
  if (!consent) {
    return (
      <Card className="mt-3">
        <p className="text-[12.5px] text-mist">Checking your permission…</p>
      </Card>
    );
  }

  if (consent.status === "unknown") {
    return (
      <Card className="mt-3">
        <div className="flex items-start gap-3">
          <ShieldQuestion size={16} strokeWidth={1.5} className="mt-px shrink-0 text-mist-dim" />
          <p className="text-[12.5px] leading-relaxed text-mist">{consent.detail}</p>
        </div>
      </Card>
    );
  }

  if (consent.status === "granted") {
    return (
      <Card className="mt-3">
        <div className="flex items-start gap-3">
          <Check size={16} strokeWidth={1.8} className="mt-px shrink-0 text-summit" />
          <div className="min-w-0">
            <p className="text-[13px] text-snow">You gave permission</p>
            <p className="mt-1 text-[11px] text-mist-dim">
              {new Date(consent.recordedAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              {consent.version ? ` · ${consent.version}` : ""}
            </p>
          </div>
        </div>

        {/* The sentence they actually agreed to, frozen at that moment — not
            whatever is on the page today. If the wording has since changed,
            showing today's version here would misrepresent their decision. */}
        {consent.wording && (
          <p className="mt-3.5 border-l border-hairline-strong pl-3 text-[12px] leading-relaxed text-mist">
            {consent.wording}
          </p>
        )}

        <Button
          variant="secondary"
          className="mt-4 w-full"
          disabled={busy}
          onClick={() => onDecide("withdrawn")}
        >
          Withdraw permission and delete my measurements
        </Button>
      </Card>
    );
  }

  /*
    Never asked, declined, or withdrawn. All three can be re-asked from this
    screen because the person opened it deliberately — but nothing anywhere else
    in the app may prompt somebody who declined. That is why `declined` is
    recorded rather than inferred from the absence of a grant.
  */
  const priorRefusal = consent.status !== "never-asked";

  return (
    <Card className="mt-3">
      {priorRefusal && (
        <p className="mb-3.5 text-[12px] leading-relaxed text-mist-dim">
          {consent.status === "withdrawn"
            ? "You withdrew this permission and your measurements were deleted. You can give it again here."
            : "You declined this permission. You can change that here."}
        </p>
      )}

      {!wordingChecked ? (
        <p className="text-[12.5px] text-mist">Loading the permission wording…</p>
      ) : !wording ? (
        /*
          NO SENTENCE, NO BUTTON. A grant recorded against no wording is refused
          by the database anyway; offering the tick and failing on the write
          would be a worse version of the same refusal.
        */
        <p className="text-[12.5px] leading-relaxed text-mist">
          ICEFALL cannot show you the permission wording just now, so it cannot ask for your
          permission. Nothing is being stored. Please try again later.
        </p>
      ) : (
        <>
          <p className="border-l border-azure/30 pl-3 text-[12.5px] leading-relaxed text-snow/90">
            {wording.wording}
          </p>
          <p className="mt-2 pl-3 text-[10px] uppercase tracking-[0.12em] text-mist-dim">
            {wording.version}
          </p>

          <div className="mt-4 space-y-2.5">
            <Button className="w-full" disabled={busy} onClick={() => onDecide("granted")}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : "I agree"}
            </Button>
            {!priorRefusal && (
              <Button
                variant="ghost"
                className="w-full"
                disabled={busy}
                onClick={() => onDecide("declined")}
              >
                No thanks
              </Button>
            )}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
            Nothing is pre-ticked and nothing else in ICEFALL changes if you say no. This permission
            covers storing measurements for the Coach and for you to read — nothing else. Sharing
            them with an expedition company, or using them for research, would be a separate
            question we have not asked.
          </p>
        </>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Connection                                                                 */
/* -------------------------------------------------------------------------- */

function ConnectionSummary({ state }: { state: OuraState }) {
  const line: Record<OuraState["status"], string> = {
    checking: "Checking…",
    "not-configured": "Not available in this build",
    "signed-out": "Signed out",
    "consent-required": "Waiting on your permission",
    disconnected: "No ring connected",
    connected: "Connected",
    attention: "Needs attention",
    unreachable: "Could not reach the server",
  };

  const tone =
    state.status === "connected"
      ? "text-summit"
      : state.status === "attention"
        ? "text-danger"
        : "text-mist-dim";

  return (
    <div className="flex items-start gap-3">
      <Circle size={16} strokeWidth={1.5} className={cn("mt-px shrink-0", tone)} />
      <div className="min-w-0">
        <p className={cn("text-[13.5px]", state.status === "connected" ? "text-snow" : "text-snow/85")}>
          {line[state.status]}
        </p>
        {state.detail && (
          <p className="mt-1.5 text-[12px] leading-relaxed text-mist">{state.detail}</p>
        )}
        {state.status === "connected" && state.lastFetchAt && (
          <p className="mt-1.5 text-[11px] text-mist-dim">
            Last read{" "}
            {new Date(state.lastFetchAt).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* One reading                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A value with its measurement date, or an em dash with the reason.
 *
 * There is no third rendering. `value === null` never falls through to a zero,
 * a blank, or a previously-held number, and a value never appears without the
 * day it belongs to.
 */
function ReadingRow({ id, reading }: { id: OuraMetricId; reading: OuraReading }) {
  const def = OURA_METRICS[id];
  // `!== null` rather than truthiness: 0 is a measured zero. Zero minutes of
  // REM sleep is a fact about the night, not a missing reading.
  const has = reading.value !== null;

  return (
    <div className="flex items-start gap-3 border-b border-hairline py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-snow">{def.label}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-mist-dim">
          {has
            ? reading.measuredOn
              ? formatDay(reading.measuredOn)
              : def.why
            : OURA_UNAVAILABLE_COPY[reading.reason ?? "no-data"]}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {has ? (
          <span className="tnum text-[15px] font-light text-snow">
            {def.format(reading.value as number)}
            {def.unit && <span className="ml-1 text-[11px] text-mist">{def.unit}</span>}
            {def.kind === "score" && <span className="ml-1 text-[11px] text-mist">/ 100</span>}
          </span>
        ) : (
          <span className="text-[15px] font-light text-mist-dim" aria-label="Not measured">
            —
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * The ring's own account of a thin night, where it gave one.
 *
 * A night with no HRV because the battery died is a different sentence from a
 * night the ring was not worn, and only Oura knows which. Rendered only when
 * there is something true to say — an empty version of this block would imply
 * the night was fine.
 */
function ContextNote({ summary }: { summary: OuraSummary }) {
  const notes: string[] = [];

  if (summary.context.lowBatteryLastNight)
    notes.push("Your ring reported a low battery during the night, so parts of it may be missing.");
  if (summary.context.lastSleepPeriodType && summary.context.lastSleepPeriodType !== "long_sleep")
    notes.push(
      `The most recent sleep Oura recorded is a ${summary.context.lastSleepPeriodType.replace(/_/g, " ")}, not a full night.`,
    );
  if (typeof summary.context.nonWearMinutes === "number" && summary.context.nonWearMinutes > 120)
    notes.push(
      `The ring was off your finger for about ${Math.round(summary.context.nonWearMinutes / 60)} hours, so the day is incomplete.`,
    );
  if (summary.backfill !== "done")
    notes.push("Your history is still being fetched, so older days may be missing for a while.");

  if (notes.length === 0) return null;

  return (
    <Rise className="pt-6">
      <SectionLabel>From the ring</SectionLabel>
      <Card className="mt-3">
        <ul className="space-y-2 text-[12px] leading-relaxed text-mist">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Card>
    </Rise>
  );
}

function formatDay(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
