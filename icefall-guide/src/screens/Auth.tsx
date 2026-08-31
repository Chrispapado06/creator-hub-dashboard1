import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { Button, Card, Disclaimer } from "@/components/ui/primitives";
import { IcefallLockup } from "@/components/ui/IcefallMark";
import { Field, Notice, inputClass } from "@/components/guide";
import { guideAccess, signInWithEmail, signOut, type GuideAccess } from "@/auth/account";
import { CREDENTIAL_SPECS } from "@/data/model";
import { OFFLINE } from "@/offline/offline";

/**
 * SIGNING IN — one ICEFALL account, whichever app you open.
 *
 * The owner ruled on 2026-08-30 that a guide uses the SAME account as the
 * athlete app. Both are browser apps only because neither is in a store yet;
 * one person, one login. The database already worked this way — nothing asks
 * which app you are in, it looks you up.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THIS SCREEN NO LONGER OFFERS TO CREATE AN ACCOUNT, AND THAT IS A SAFETY RULE.
 *
 * It used to: a four-step flow collecting a name, a rate and documents. It never
 * submitted anything, and it could not have — registration ALWAYS creates an
 * athlete and cannot create anything else. `profiles_insert_self` carries
 * `with check (id = auth.uid() and role = 'athlete')`, and `handle_new_user`
 * passes the literal.
 *
 * That invariant is not an obstacle to route around. A person self-declaring as
 * a qualified mountain guide — to strangers who will then follow them onto a
 * glacier — is exactly what it exists to prevent. A guide becomes one because a
 * member of ICEFALL staff read their documents and created their
 * `guide_profiles` row.
 *
 * So: sign in only. Somebody whose account is not a guide account is told
 * plainly, and is NOT offered a way to become one, because this app has no
 * honest way to give them that.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default function Auth() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Offline the app is ALREADY signed in as the demo guide, and that is known
   * before the first paint. Initialising here rather than waiting for the effect
   * is what stops a sign-in form appearing for one frame in a build that has
   * nothing to sign in to. Unset, this is `null` exactly as it always was.
   */
  const [access, setAccess] = useState<GuideAccess | null>(OFFLINE ? "guide" : null);

  useEffect(() => {
    void guideAccess().then(setAccess);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await signInWithEmail(email, password);
    if (!r.ok) {
      setBusy(false);
      setError(r.message);
      return;
    }
    const a = await guideAccess();
    setAccess(a);
    setBusy(false);
    if (a === "guide") navigate("/");
  };

  return (
    <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-10">
      <div className="pb-7 pt-10 text-center">
        <IcefallLockup className="items-center" />
        <p className="section-label mt-3 text-azure">Guide</p>
        <h1 className="display mt-6 text-[26px] text-snow">Welcome back.</h1>
        <p className="mx-auto mt-3 max-w-[300px] text-[12.5px] leading-relaxed text-mist">
          Your dates, your clients and your qualifications.
        </p>
      </div>

      {/* ---- Signed in, but not as a guide ---------------------------------- */}
      {access === "not-a-guide" ? (
        <Card>
          <p className="text-[13.5px] text-snow">This is a guide's app</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-mist">
            You are signed in, and your ICEFALL account is not a guide account. Nothing is wrong
            with it — every ICEFALL account starts as a climber's, and it becomes a guide's when a
            member of our staff has read your qualifications and set it up.
          </p>
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist-dim">
            If you have already sent your documents in, they are with us; this app opens on its own
            once your account is a guide's.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => void signOut().then(() => setAccess("signed-out"))}
          >
            Sign out
          </Button>
        </Card>
      ) : access === "guide" ? (
        <Card>
          <p className="text-[13.5px] text-snow">You are signed in.</p>
          <Button size="sm" className="mt-3" asChild>
            <Link to="/">Open the app</Link>
          </Button>
        </Card>
      ) : (
        <form onSubmit={submit}>
          <Card>
            <div className="space-y-4">
              <Field label="Email">
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@example.com"
                />
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  placeholder="••••••••"
                />
              </Field>
            </div>

            {error && (
              <p className="mt-3 text-[12px] leading-relaxed text-danger">{error}</p>
            )}

            <Button
              type="submit"
              size="lg"
              className="mt-5 w-full"
              disabled={busy || !email.trim() || !password}
            >
              {busy ? "Signing in…" : "Sign in"}
            </Button>

            {access === "offline" && (
              <Disclaimer className="mt-4">
                ICEFALL is not connected on this device, so signing in is not possible here.
              </Disclaimer>
            )}
          </Card>
        </form>
      )}

      {/* ---- How somebody becomes a guide, since they cannot do it here ----- */}
      {access !== "guide" && (
        <>
          <Notice tone="neutral" className="mt-6">
            <div className="flex gap-2.5">
              <ShieldCheck size={15} strokeWidth={1.8} className="mt-px shrink-0 text-azure" />
              <div>
                <p className="text-snow">Not a guide with ICEFALL yet?</p>
                <p className="mt-1.5">
                  You cannot sign yourself up as one here, and that is deliberate — a client picks a
                  guide and then follows them onto a glacier. A member of ICEFALL staff reads every
                  guide's documents before their account becomes one.
                </p>
              </div>
            </div>
          </Notice>

          <div className="mt-4">
            <p className="section-label">What we ask for</p>
            <ul className="mt-2.5 space-y-1.5">
              {CREDENTIAL_SPECS.filter((s) => s.required).map((s) => (
                <li key={s.kind} className="flex gap-2 text-[12px] leading-relaxed text-mist">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure" />
                  {s.label}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11.5px] leading-relaxed text-mist-dim">
              We read them. We do not contact your association, and your badge says exactly that.
            </p>
          </div>
        </>
      )}

      <p className="mt-7 text-center">
        <Link to="/" className="text-[12px] text-mist-dim underline underline-offset-4">
          Skip — look around the app
        </Link>
      </p>
    </div>
  );
}
