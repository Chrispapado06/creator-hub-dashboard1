/**
 * Choose a username and say where you climb from.
 *
 * WHY THIS SCREEN EXISTS SEPARATELY FROM SIGNUP. With Google, Apple or Microsoft
 * you get a session and a verified email before anybody can be asked a single
 * question. The account exists; the handle does not. Rather than maintain one
 * ordering for email signup and another for social, both land here — because
 * "signed in with Google and has never picked a handle" and "confirmed their
 * email and has never picked a handle" are the same state: a session whose
 * profile has a null username.
 *
 * UNSKIPPABLE, BUT NEVER A TRAP. There is no way past it without choosing, and
 * there is always a way OUT of it — sign out is on the screen. A mandatory step
 * with no exit is how somebody ends up with an account they cannot use and
 * cannot leave.
 *
 * THE AVAILABILITY TICK IS A COURTESY AND IS ALWAYS STALE. Two people can both
 * be told a name is free and only one can have it. So the tick is cleared the
 * instant a claim comes back taken — otherwise the screen would be showing two
 * statements that contradict each other — and the suggestions arrive in the same
 * round trip as the refusal, so nobody waits twice.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Listbox } from "@/components/ui/Listbox";
import { useNavigate } from "react-router-dom";
import { Check, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { AuthScreen, Field, Note } from "./Auth";
import {
  type Availability,
  PROBLEM_TEXT,
  claimUsername,
  checkAvailability,
  formatProblem,
  normalise,
} from "@/auth/username";
import { setMyLocation, signOut } from "@/auth/account";

/**
 * A short list, not the full ISO 3166 set.
 *
 * The country is here because it is the only part of a location the product can
 * act on — currency, regional operators — without implying precision it does not
 * have. "Prefer not to say" is a real answer and is the default: a required
 * country on a signup screen is a question nobody agreed to answer.
 */
const COUNTRIES: { code: string; name: string }[] = [
  { code: "AR", name: "Argentina" }, { code: "AT", name: "Austria" },
  { code: "AU", name: "Australia" }, { code: "BE", name: "Belgium" },
  { code: "BO", name: "Bolivia" }, { code: "BR", name: "Brazil" },
  { code: "CA", name: "Canada" }, { code: "CH", name: "Switzerland" },
  { code: "CL", name: "Chile" }, { code: "CN", name: "China" },
  { code: "CZ", name: "Czechia" }, { code: "DE", name: "Germany" },
  { code: "DK", name: "Denmark" }, { code: "EC", name: "Ecuador" },
  { code: "ES", name: "Spain" }, { code: "FI", name: "Finland" },
  { code: "FR", name: "France" }, { code: "GB", name: "United Kingdom" },
  { code: "GR", name: "Greece" }, { code: "IE", name: "Ireland" },
  { code: "IN", name: "India" }, { code: "IS", name: "Iceland" },
  { code: "IT", name: "Italy" }, { code: "JP", name: "Japan" },
  { code: "KE", name: "Kenya" }, { code: "KG", name: "Kyrgyzstan" },
  { code: "MA", name: "Morocco" }, { code: "MX", name: "Mexico" },
  { code: "NL", name: "Netherlands" }, { code: "NO", name: "Norway" },
  { code: "NP", name: "Nepal" }, { code: "NZ", name: "New Zealand" },
  { code: "PE", name: "Peru" }, { code: "PK", name: "Pakistan" },
  { code: "PL", name: "Poland" }, { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" }, { code: "SE", name: "Sweden" },
  { code: "SI", name: "Slovenia" }, { code: "SK", name: "Slovakia" },
  { code: "TZ", name: "Tanzania" }, { code: "US", name: "United States" },
  { code: "ZA", name: "South Africa" },
];

export function ChooseHandle() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [avail, setAvail] = useState<Availability>({ state: "unknown" });
  const [town, setTown] = useState("");
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem = formatProblem(username);
  const seq = useRef(0);

  // Debounced availability. The sequence guard matters: a fast typist can have
  // three checks in flight, and without it the answer for "chr" can land after
  // the answer for "chris" and overwrite it.
  useEffect(() => {
    if (problem) {
      setAvail({ state: problem === "empty" ? "unknown" : "format" });
      return;
    }
    const mine = ++seq.current;
    setAvail({ state: "checking" });
    const t = setTimeout(async () => {
      const result = await checkAvailability(username);
      if (seq.current === mine) setAvail(result);
    }, 350);
    return () => clearTimeout(t);
  }, [username, problem]);

  const submit = useCallback(async () => {
    if (problem || busy) return;
    setBusy(true);
    setError(null);

    const claim = await claimUsername(username);

    if (!claim.ok) {
      // Clear the tick FIRST. Leaving a green "available" above a "taken"
      // message is the screen arguing with itself.
      if (claim.reason === "taken") {
        setAvail({ state: "taken", suggestions: claim.suggestions });
        setError(null);
      } else if (claim.reason === "reserved") {
        setAvail({ state: "reserved" });
      } else if (claim.reason === "signed-out") {
        setError("Your session expired. Sign in again — nothing you typed is lost.");
      } else {
        setError("Couldn't reach the account server. Your name isn't taken — try again in a moment.");
      }
      setBusy(false);
      return;
    }

    // The location is saved second and is allowed to fail quietly: the handle is
    // the thing that had to be claimed atomically, and losing a town to a flaky
    // connection must not cost somebody the name they just won.
    if (town.trim() || country) await setMyLocation(town, country || null);

    setBusy(false);
    navigate("/onboarding", { replace: true });
  }, [problem, busy, username, town, country, navigate]);

  const ready = !problem && !busy && avail.state !== "taken" && avail.state !== "reserved";

  return (
    <AuthScreen
      eyebrow="One more thing"
      title={["Pick your", "name on the mountain."]}
      subtitle="Your username is how other climbers find you. It can't be changed often, so choose one you'll want."
      art="/img/expedition-hero.jpg"
      footer={
        <button
          type="button"
          onClick={async () => {
            await signOut();
            navigate("/welcome", { replace: true });
          }}
          className="text-[12px] text-mist transition-colors hover:text-snow"
        >
          Sign out
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <Field
            label="Username"
            value={username}
            onChange={(v) => setUsername(normalise(v))}
            placeholder="chris.climbs"
            autoComplete="off"
          />
          <StatusLine
            problem={problem && username.length > 0 ? PROBLEM_TEXT[problem] : null}
            avail={avail}
            onPick={(s) => setUsername(s)}
          />
        </div>

        <Field
          label="Town or region"
          value={town}
          onChange={setTown}
          placeholder="Chamonix"
          autoComplete="address-level2"
        />

        <div>
          <span className="section-label text-mist-dim">Country</span>
          {/* Well past the typeahead threshold, so typing filters — which the
              native menu never offered on this list of ~200. */}
          <Listbox
            label="Country"
            value={country}
            onChange={setCountry}
            placeholder="Prefer not to say"
            options={[
              { value: "", label: "Prefer not to say" },
              ...COUNTRIES.map((c) => ({ value: c.code, label: c.name })),
            ]}
            className="mt-2"
          />
        </div>

        {error && <p className="text-[12px] leading-relaxed text-danger">{error}</p>}

        <Button className="w-full" disabled={!ready} onClick={submit}>
          {busy ? "Claiming…" : "Continue"}
        </Button>

        <Note>
          A town or region only — ICEFALL has no field for an address, and this is
          never turned into a map position. Leave the country blank if you'd rather
          not say; nothing on the app depends on it.
        </Note>
      </div>
    </AuthScreen>
  );
}

function StatusLine({
  problem,
  avail,
  onPick,
}: {
  problem: string | null;
  avail: Availability;
  onPick: (s: string) => void;
}) {
  if (problem) return <Line tone="bad">{problem}</Line>;

  switch (avail.state) {
    case "checking":
      return (
        <Line tone="muted">
          <LoaderCircle size={12} strokeWidth={2} className="animate-spin" /> Checking…
        </Line>
      );
    case "free":
      return (
        <Line tone="good">
          <Check size={12} strokeWidth={2.4} /> Available right now
        </Line>
      );
    case "reserved":
      return <Line tone="bad">That one is kept for ICEFALL itself.</Line>;
    case "taken":
      return (
        <div className="mt-2 space-y-2">
          <Line tone="bad">
            <X size={12} strokeWidth={2.4} /> Someone has that one. Try:
          </Line>
          <div className="flex flex-wrap gap-1.5">
            {avail.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onPick(s)}
                className="rounded-pill border border-hairline px-2.5 py-1 text-[11.5px] text-mist transition-colors hover:border-azure/50 hover:text-snow"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      );
    case "offline":
      // Never "that name is free" — we do not know that.
      return <Line tone="muted">Can't check right now. You can still try to claim it.</Line>;
    default:
      return null;
  }
}

function Line({ tone, children }: { tone: "good" | "bad" | "muted"; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "mt-2 flex items-center gap-1.5 text-[11.5px] leading-relaxed",
        tone === "good" && "text-azure",
        tone === "bad" && "text-danger",
        tone === "muted" && "text-mist-dim",
      )}
    >
      {children}
    </p>
  );
}
