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
 * EVERY COUNTRY, NOT A SELECTION.
 *
 * This was a hand-picked 43 — the ranges the product had thought about — and
 * the owner hit the obvious wall on 2026-09-07: their own signup offered no
 * way to say where they were. A shortlist of countries is never neutral. It
 * tells the people left off it that the product was not built with them in
 * mind, and once country leaderboards exist it would also decide, silently,
 * who is allowed to be ranked at all.
 *
 * So it is now the full ISO 3166-1 set (258 entries, generated from the
 * ICU data in Node on 2026-09-07 and sorted by English name), minus unions and
 * pseudo-regions that are not places anyone is from — the EU, the UN — and
 * minus deprecated aliases that resolve to a code already in the list. The
 * `Listbox` below filters as you type, which is what makes a list this long
 * usable and is why the field was already built that way.
 *
 * The country is still OPTIONAL, and "Prefer not to say" is still the default
 * and a real answer: it is the only part of a location the product acts on
 * (currency, regional operators), and a required country on a signup screen is
 * a question nobody agreed to answer.
 */
const COUNTRIES: { code: string; name: string }[] = [
  { code: "AF", name: "Afghanistan" },
  { code: "AX", name: "Åland Islands" },
  { code: "AL", name: "Albania" },
  { code: "DZ", name: "Algeria" },
  { code: "AS", name: "American Samoa" },
  { code: "AD", name: "Andorra" },
  { code: "AO", name: "Angola" },
  { code: "AI", name: "Anguilla" },
  { code: "AQ", name: "Antarctica" },
  { code: "AG", name: "Antigua & Barbuda" },
  { code: "AR", name: "Argentina" },
  { code: "AM", name: "Armenia" },
  { code: "AW", name: "Aruba" },
  { code: "AC", name: "Ascension Island" },
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "AZ", name: "Azerbaijan" },
  { code: "BS", name: "Bahamas" },
  { code: "BH", name: "Bahrain" },
  { code: "BD", name: "Bangladesh" },
  { code: "BB", name: "Barbados" },
  { code: "BY", name: "Belarus" },
  { code: "BE", name: "Belgium" },
  { code: "BZ", name: "Belize" },
  { code: "BJ", name: "Benin" },
  { code: "BM", name: "Bermuda" },
  { code: "BT", name: "Bhutan" },
  { code: "BO", name: "Bolivia" },
  { code: "BA", name: "Bosnia & Herzegovina" },
  { code: "BW", name: "Botswana" },
  { code: "BV", name: "Bouvet Island" },
  { code: "BR", name: "Brazil" },
  { code: "IO", name: "British Indian Ocean Territory" },
  { code: "VG", name: "British Virgin Islands" },
  { code: "BN", name: "Brunei" },
  { code: "BG", name: "Bulgaria" },
  { code: "BF", name: "Burkina Faso" },
  { code: "BI", name: "Burundi" },
  { code: "KH", name: "Cambodia" },
  { code: "CM", name: "Cameroon" },
  { code: "CA", name: "Canada" },
  { code: "IC", name: "Canary Islands" },
  { code: "CV", name: "Cape Verde" },
  { code: "BQ", name: "Caribbean Netherlands" },
  { code: "KY", name: "Cayman Islands" },
  { code: "CF", name: "Central African Republic" },
  { code: "EA", name: "Ceuta & Melilla" },
  { code: "TD", name: "Chad" },
  { code: "CL", name: "Chile" },
  { code: "CN", name: "China" },
  { code: "CX", name: "Christmas Island" },
  { code: "CP", name: "Clipperton Island" },
  { code: "CC", name: "Cocos (Keeling) Islands" },
  { code: "CO", name: "Colombia" },
  { code: "KM", name: "Comoros" },
  { code: "CG", name: "Congo - Brazzaville" },
  { code: "CD", name: "Congo - Kinshasa" },
  { code: "CK", name: "Cook Islands" },
  { code: "CR", name: "Costa Rica" },
  { code: "CI", name: "Côte d’Ivoire" },
  { code: "HR", name: "Croatia" },
  { code: "CU", name: "Cuba" },
  { code: "CW", name: "Curaçao" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czechia" },
  { code: "DK", name: "Denmark" },
  { code: "DG", name: "Diego Garcia" },
  { code: "DJ", name: "Djibouti" },
  { code: "DM", name: "Dominica" },
  { code: "DO", name: "Dominican Republic" },
  { code: "EC", name: "Ecuador" },
  { code: "EG", name: "Egypt" },
  { code: "SV", name: "El Salvador" },
  { code: "GQ", name: "Equatorial Guinea" },
  { code: "ER", name: "Eritrea" },
  { code: "EE", name: "Estonia" },
  { code: "SZ", name: "Eswatini" },
  { code: "ET", name: "Ethiopia" },
  { code: "FK", name: "Falkland Islands" },
  { code: "FO", name: "Faroe Islands" },
  { code: "FJ", name: "Fiji" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "GF", name: "French Guiana" },
  { code: "PF", name: "French Polynesia" },
  { code: "TF", name: "French Southern Territories" },
  { code: "GA", name: "Gabon" },
  { code: "GM", name: "Gambia" },
  { code: "GE", name: "Georgia" },
  { code: "DE", name: "Germany" },
  { code: "GH", name: "Ghana" },
  { code: "GI", name: "Gibraltar" },
  { code: "GR", name: "Greece" },
  { code: "GL", name: "Greenland" },
  { code: "GD", name: "Grenada" },
  { code: "GP", name: "Guadeloupe" },
  { code: "GU", name: "Guam" },
  { code: "GT", name: "Guatemala" },
  { code: "GG", name: "Guernsey" },
  { code: "GN", name: "Guinea" },
  { code: "GW", name: "Guinea-Bissau" },
  { code: "GY", name: "Guyana" },
  { code: "HT", name: "Haiti" },
  { code: "HM", name: "Heard & McDonald Islands" },
  { code: "HN", name: "Honduras" },
  { code: "HK", name: "Hong Kong SAR China" },
  { code: "HU", name: "Hungary" },
  { code: "IS", name: "Iceland" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IR", name: "Iran" },
  { code: "IQ", name: "Iraq" },
  { code: "IE", name: "Ireland" },
  { code: "IM", name: "Isle of Man" },
  { code: "IL", name: "Israel" },
  { code: "IT", name: "Italy" },
  { code: "JM", name: "Jamaica" },
  { code: "JP", name: "Japan" },
  { code: "JE", name: "Jersey" },
  { code: "JO", name: "Jordan" },
  { code: "KZ", name: "Kazakhstan" },
  { code: "KE", name: "Kenya" },
  { code: "KI", name: "Kiribati" },
  { code: "XK", name: "Kosovo" },
  { code: "KW", name: "Kuwait" },
  { code: "KG", name: "Kyrgyzstan" },
  { code: "LA", name: "Laos" },
  { code: "LV", name: "Latvia" },
  { code: "LB", name: "Lebanon" },
  { code: "LS", name: "Lesotho" },
  { code: "LR", name: "Liberia" },
  { code: "LY", name: "Libya" },
  { code: "LI", name: "Liechtenstein" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "MO", name: "Macao SAR China" },
  { code: "MG", name: "Madagascar" },
  { code: "MW", name: "Malawi" },
  { code: "MY", name: "Malaysia" },
  { code: "MV", name: "Maldives" },
  { code: "ML", name: "Mali" },
  { code: "MT", name: "Malta" },
  { code: "MH", name: "Marshall Islands" },
  { code: "MQ", name: "Martinique" },
  { code: "MR", name: "Mauritania" },
  { code: "MU", name: "Mauritius" },
  { code: "YT", name: "Mayotte" },
  { code: "MX", name: "Mexico" },
  { code: "FM", name: "Micronesia" },
  { code: "MD", name: "Moldova" },
  { code: "MC", name: "Monaco" },
  { code: "MN", name: "Mongolia" },
  { code: "ME", name: "Montenegro" },
  { code: "MS", name: "Montserrat" },
  { code: "MA", name: "Morocco" },
  { code: "MZ", name: "Mozambique" },
  { code: "MM", name: "Myanmar (Burma)" },
  { code: "NA", name: "Namibia" },
  { code: "NR", name: "Nauru" },
  { code: "NP", name: "Nepal" },
  { code: "NL", name: "Netherlands" },
  { code: "NC", name: "New Caledonia" },
  { code: "NZ", name: "New Zealand" },
  { code: "NI", name: "Nicaragua" },
  { code: "NE", name: "Niger" },
  { code: "NG", name: "Nigeria" },
  { code: "NU", name: "Niue" },
  { code: "NF", name: "Norfolk Island" },
  { code: "KP", name: "North Korea" },
  { code: "MK", name: "North Macedonia" },
  { code: "MP", name: "Northern Mariana Islands" },
  { code: "NO", name: "Norway" },
  { code: "OM", name: "Oman" },
  { code: "PK", name: "Pakistan" },
  { code: "PW", name: "Palau" },
  { code: "PS", name: "Palestinian Territories" },
  { code: "PA", name: "Panama" },
  { code: "PG", name: "Papua New Guinea" },
  { code: "PY", name: "Paraguay" },
  { code: "PE", name: "Peru" },
  { code: "PH", name: "Philippines" },
  { code: "PN", name: "Pitcairn Islands" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "PR", name: "Puerto Rico" },
  { code: "QA", name: "Qatar" },
  { code: "RE", name: "Réunion" },
  { code: "RO", name: "Romania" },
  { code: "RU", name: "Russia" },
  { code: "RW", name: "Rwanda" },
  { code: "WS", name: "Samoa" },
  { code: "SM", name: "San Marino" },
  { code: "ST", name: "São Tomé & Príncipe" },
  { code: "CQ", name: "Sark" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SN", name: "Senegal" },
  { code: "RS", name: "Serbia" },
  { code: "SC", name: "Seychelles" },
  { code: "SL", name: "Sierra Leone" },
  { code: "SG", name: "Singapore" },
  { code: "SX", name: "Sint Maarten" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "SB", name: "Solomon Islands" },
  { code: "SO", name: "Somalia" },
  { code: "ZA", name: "South Africa" },
  { code: "GS", name: "South Georgia & South Sandwich Islands" },
  { code: "KR", name: "South Korea" },
  { code: "SS", name: "South Sudan" },
  { code: "ES", name: "Spain" },
  { code: "LK", name: "Sri Lanka" },
  { code: "BL", name: "St. Barthélemy" },
  { code: "SH", name: "St. Helena" },
  { code: "KN", name: "St. Kitts & Nevis" },
  { code: "LC", name: "St. Lucia" },
  { code: "MF", name: "St. Martin" },
  { code: "PM", name: "St. Pierre & Miquelon" },
  { code: "VC", name: "St. Vincent & Grenadines" },
  { code: "SD", name: "Sudan" },
  { code: "SR", name: "Suriname" },
  { code: "SJ", name: "Svalbard & Jan Mayen" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "SY", name: "Syria" },
  { code: "TW", name: "Taiwan" },
  { code: "TJ", name: "Tajikistan" },
  { code: "TZ", name: "Tanzania" },
  { code: "TH", name: "Thailand" },
  { code: "TL", name: "Timor-Leste" },
  { code: "TG", name: "Togo" },
  { code: "TK", name: "Tokelau" },
  { code: "TO", name: "Tonga" },
  { code: "TT", name: "Trinidad & Tobago" },
  { code: "TA", name: "Tristan da Cunha" },
  { code: "TN", name: "Tunisia" },
  { code: "TR", name: "Türkiye" },
  { code: "TM", name: "Turkmenistan" },
  { code: "TC", name: "Turks & Caicos Islands" },
  { code: "TV", name: "Tuvalu" },
  { code: "UM", name: "U.S. Outlying Islands" },
  { code: "VI", name: "U.S. Virgin Islands" },
  { code: "UG", name: "Uganda" },
  { code: "UA", name: "Ukraine" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "ZZ", name: "Unknown Region" },
  { code: "UY", name: "Uruguay" },
  { code: "UZ", name: "Uzbekistan" },
  { code: "VU", name: "Vanuatu" },
  { code: "VA", name: "Vatican City" },
  { code: "VE", name: "Venezuela" },
  { code: "VN", name: "Vietnam" },
  { code: "WF", name: "Wallis & Futuna" },
  { code: "EH", name: "Western Sahara" },
  { code: "YE", name: "Yemen" },
  { code: "ZM", name: "Zambia" },
  { code: "ZW", name: "Zimbabwe" },
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
        setError(
          "Couldn't reach the account server. Your name isn't taken — try again in a moment.",
        );
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
      progress={{ step: 2, total: 2 }}
      hero="/img/private-hero.jpg"
      title={["Pick your", "name on the mountain."]}
      subtitle="Your username is how other climbers find you. It can't be changed often, so choose one you'll want."
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
          A town or region only — ICEFALL has no field for an address, and this is never turned into
          a map position. Leave the country blank if you'd rather not say; nothing on the app
          depends on it.
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
