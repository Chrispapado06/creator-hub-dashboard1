import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { AppleMark, GoogleMark } from "./PayMarks";
import { Button } from "./ui";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

/**
 * Sign in or create an account — the Airbnb pattern.
 *
 * A modal, not a page, so it can drop in over whatever you were doing and hand
 * you back to it. Email and password validate; a valid submit creates a LOCAL
 * session — there is no account server, and the notice says so rather than
 * implying your details went anywhere. The wallet-style social buttons are shown
 * for shape but disabled, because real OAuth needs a backend this build does not
 * have.
 */
export function AuthModal() {
  const { authOpen, authMode, setMode, closeAuth, signIn, signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);

  const up = authMode === "up";

  // Reset the form each time the modal opens, and lock body scroll.
  useEffect(() => {
    if (authOpen) {
      setName("");
      setEmail("");
      setPassword("");
      setTouched(false);
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [authOpen]);

  // Escape closes it.
  useEffect(() => {
    if (!authOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeAuth();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [authOpen, closeAuth]);

  if (!authOpen) return null;

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const passOk = password.length >= 10;
  const nameOk = !up || name.trim().length >= 2;
  const valid = emailOk && passOk && nameOk;

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    if (up) signUp(name.trim(), email.trim());
    else signIn(email.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Close"
        onClick={closeAuth}
        className="absolute inset-0 bg-obsidian/70 backdrop-blur-sm"
      />

      <div className="relative w-full max-w-[420px] overflow-hidden rounded-card border border-hairline bg-graphite shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]">
        <header className="relative flex items-center justify-center border-b border-hairline px-4 py-3.5">
          <button
            onClick={closeAuth}
            aria-label="Close"
            className="absolute left-3 grid h-8 w-8 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.06] hover:text-snow"
          >
            <X size={17} strokeWidth={1.8} />
          </button>
          <p className="text-[13.5px] font-medium text-snow">
            {up ? "Create an account" : "Sign in"}
          </p>
        </header>

        <div className="p-5">
          <h2 className="text-[19px] font-light text-snow">Welcome to ICEFALL</h2>

          <div className="mt-4 space-y-2.5">
            {up && (
              <Field
                label="Full name"
                value={name}
                onChange={setName}
                placeholder="As it appears on your ID"
                invalid={touched && !nameOk}
                autoComplete="name"
              />
            )}
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              invalid={touched && !emailOk}
              autoComplete="email"
            />
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder={up ? "At least 10 characters" : "Your password"}
              invalid={touched && !passOk}
              autoComplete={up ? "new-password" : "current-password"}
            />
          </div>

          <Button size="lg" className="mt-4 w-full" onClick={submit}>
            {up ? "Create account" : "Sign in"}
          </Button>

          <p className="mt-3 rounded-tile border border-hairline bg-obsidian/40 px-3 py-2.5 text-[11px] leading-relaxed text-mist-dim">
            This is a local demo session — ICEFALL has no account server connected yet. Your details
            are kept on this device only and nothing is transmitted.
          </p>

          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-hairline" />
            <span className="text-[11px] text-mist-dim">or</span>
            <span className="h-px flex-1 bg-hairline" />
          </div>

          <div className="space-y-2.5">
            <Social icon={<AppleMark className="h-[18px] w-auto text-snow" />} label="Continue with Apple" />
            <Social icon={<GoogleMark className="h-[18px] w-auto" />} label="Continue with Google" />
          </div>
          <p className="mt-2.5 text-center text-[10.5px] text-mist-dim">
            Social sign-in needs a backend and is not wired in this build.
          </p>

          <p className="mt-5 text-center text-[12.5px] text-mist">
            {up ? "Already have an account?" : "New to ICEFALL?"}{" "}
            <button onClick={() => setMode(up ? "in" : "up")} className="text-azure">
              {up ? "Sign in" : "Create one"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  invalid,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  invalid?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="section-label">{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "mt-1.5 w-full rounded-tile border bg-elevated/50 px-3 py-2.5 text-[14px] text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure",
          invalid ? "border-danger/60" : "border-hairline",
        )}
      />
    </label>
  );
}

function Social({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      disabled
      className="flex w-full items-center justify-center gap-2.5 rounded-tile border border-hairline bg-slate/60 py-2.5 text-[13px] text-mist disabled:opacity-55"
    >
      {icon}
      {label}
    </button>
  );
}
