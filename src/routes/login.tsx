import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  LockKeyhole, Eye, EyeOff, ShieldCheck, Headset, ArrowRight,
  ArrowLeft, Sparkles, Loader2,
} from "lucide-react";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign In — Agency Console" }] }),
  component: LoginPage,
});

type Portal = "admin" | "staff";

const PORTALS: Record<Portal, {
  title: string;
  tagline: string;
  bullets: string[];
  icon: React.ReactNode;
  /** Tailwind classes for the icon chip gradient. */
  chip: string;
  /** Glow color used on card hover + submit button. */
  glow: string;
}> = {
  admin: {
    title: "Admin Console",
    tagline: "Run the whole agency",
    bullets: ["Revenue & analytics", "Creators & campaigns", "Staff management"],
    icon: <ShieldCheck className="h-7 w-7" />,
    chip: "from-primary to-primary-glow",
    glow: "oklch(0.56 0.14 150 / 0.35)",
  },
  staff: {
    title: "Staff Portal",
    tagline: "Your shift starts here",
    bullets: ["Clock in & out", "Team chat", "Daily tasks"],
    icon: <Headset className="h-7 w-7" />,
    chip: "from-cyan-500 to-sky-400",
    glow: "oklch(0.72 0.13 220 / 0.35)",
  },
};

function LoginPage() {
  const navigate = useNavigate();
  const [portal, setPortal] = useState<Portal | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agencyName, setAgencyName] = useState("Agency Console");
  // Bumped on every failed attempt — re-mounts the form card so the
  // shake animation replays even on back-to-back failures.
  const [shakeKey, setShakeKey] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const session = localStorage.getItem("agency_session");
      if (session) navigate({ to: "/" });
    }
    supabase.from("agency_settings").select("agency_name, logo_url").maybeSingle().then(({ data }) => {
      if (data?.agency_name) setAgencyName(data.agency_name);
    });
  }, []);

  const fail = (msg: string) => {
    toast.error(msg);
    setShakeKey((k) => k + 1);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    const p = password;
    if (!u || !p) {
      fail("Username and password are required.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("access_codes")
      .select("id, username, password, active, account_type, chatter_id, allowed_pages")
      .eq("username", u)
      .eq("password", p)
      .eq("active", true)
      .maybeSingle();
    setLoading(false);
    if (error || !data) {
      fail("Invalid username or password.");
      return;
    }
    // The chosen portal must match the account's actual type — admins
    // can't slip into the staff portal and vice versa. This keeps the
    // post-login redirect (and the route guards) predictable.
    const accountType = data.account_type ?? "admin";
    if (portal === "staff" && accountType !== "staff") {
      fail("This is an admin account — go back and use Admin Console.");
      return;
    }
    if (portal === "admin" && accountType === "staff") {
      fail("This is a staff account — go back and use Staff Portal.");
      return;
    }
    const session = JSON.stringify({
      username: data.username,
      type: accountType,
      chatter_id: data.chatter_id ?? null,
      allowed_pages: (data as { allowed_pages?: string[] | null }).allowed_pages ?? null,
    });
    localStorage.setItem("agency_session", session);
    void logAudit({
      action: "login",
      entity_type: "session",
      entity_name: data.username,
      details: accountType === "staff" ? "staff portal" : "admin",
    });
    window.dispatchEvent(new Event("agency-auth-changed"));
    navigate({ to: accountType === "staff" ? "/clock" : "/" });
  };

  const active = portal ? PORTALS[portal] : null;

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center bg-background px-4">
      <Toaster />

      {/* ── Animated backdrop — aurora blobs + dot grid ─────────────── */}
      <style>{`
        @keyframes login-blob-a {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%      { transform: translate(60px, -40px) scale(1.15); }
          66%      { transform: translate(-40px, 30px) scale(0.92); }
        }
        @keyframes login-blob-b {
          0%, 100% { transform: translate(0, 0) scale(1); }
          40%      { transform: translate(-70px, 50px) scale(1.1); }
          75%      { transform: translate(50px, -30px) scale(0.95); }
        }
        @keyframes login-blob-c {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(40px, 60px) scale(1.2); }
        }
        @keyframes login-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-9px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(4px); }
        }
        @keyframes login-rise {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes login-pop {
          from { opacity: 0; transform: scale(0.8); }
          to   { opacity: 1; transform: scale(1); }
        }
        .login-blob-a { animation: login-blob-a 22s ease-in-out infinite; }
        .login-blob-b { animation: login-blob-b 28s ease-in-out infinite; }
        .login-blob-c { animation: login-blob-c 19s ease-in-out infinite; }
        .login-shake  { animation: login-shake 0.45s ease-in-out; }
        .login-rise   { animation: login-rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .login-pop    { animation: login-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        @media (prefers-reduced-motion: reduce) {
          .login-blob-a, .login-blob-b, .login-blob-c,
          .login-shake, .login-rise, .login-pop { animation: none; }
        }
      `}</style>

      <div aria-hidden className="absolute inset-0 pointer-events-none">
        {/* Aurora blobs — brand green + teal, heavily blurred */}
        <div className="login-blob-a absolute -top-32 -left-24 h-96 w-96 rounded-full bg-primary/25 blur-3xl" />
        <div className="login-blob-b absolute top-1/3 -right-32 h-[28rem] w-[28rem] rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="login-blob-c absolute -bottom-40 left-1/4 h-80 w-80 rounded-full bg-cyan-400/15 blur-3xl" />
        {/* Dot grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: "radial-gradient(oklch(0.56 0.14 150 / 0.12) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        />
        {/* Soft vignette so the center pops */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,oklch(0.985_0.004_110/0.8)_100%)]" />
      </div>

      <div className="relative z-10 w-full max-w-2xl">
        {/* ── Brand header ────────────────────────────────────────────── */}
        <div className="text-center space-y-3 mb-10 login-rise">
          <div className="flex justify-center">
            <div className="relative">
              {/* Pulsing glow halo behind the logo */}
              <div className="absolute inset-0 rounded-2xl bg-primary/40 blur-xl animate-pulse" />
              <div className="relative h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary-glow shadow-lg flex items-center justify-center">
                <LockKeyhole className="h-8 w-8 text-primary-foreground" />
              </div>
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{agencyName}</h1>
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {portal ? PORTALS[portal].tagline : "Choose your portal to continue"}
          </p>
        </div>

        {portal === null ? (
          /* ── Stage 1 — portal picker ─────────────────────────────── */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(Object.keys(PORTALS) as Portal[]).map((key, i) => {
              const p = PORTALS[key];
              return (
                <button
                  key={key}
                  onClick={() => setPortal(key)}
                  className="login-rise group relative text-left rounded-3xl border border-border bg-card/80 backdrop-blur-sm p-6 transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{
                    animationDelay: `${0.12 + i * 0.1}s`,
                    boxShadow: "0 1px 3px oklch(0 0 0 / 0.06)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = `0 18px 44px -16px ${p.glow}`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = "0 1px 3px oklch(0 0 0 / 0.06)";
                  }}
                >
                  <div
                    className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${p.chip} text-white flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}
                  >
                    {p.icon}
                  </div>
                  <div className="text-lg font-bold tracking-tight">{p.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 mb-3">{p.tagline}</div>
                  <ul className="space-y-1">
                    {p.bullets.map((b) => (
                      <li key={b} className="text-[11px] text-muted-foreground/80 flex items-center gap-1.5">
                        <span className="h-1 w-1 rounded-full bg-primary/60 shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                  <span className="absolute bottom-5 right-5 inline-flex items-center justify-center h-8 w-8 rounded-full bg-secondary text-muted-foreground transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:translate-x-1">
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          /* ── Stage 2 — credentials ───────────────────────────────── */
          <div key={shakeKey} className={`max-w-sm mx-auto ${shakeKey > 0 ? "login-shake" : "login-pop"}`}>
            <div className="rounded-3xl border border-border bg-card/90 backdrop-blur-sm p-6 sm:p-8 shadow-[0_20px_50px_-20px_oklch(0_0_0/0.15)]">
              <button
                type="button"
                onClick={() => { setPortal(null); setShakeKey(0); }}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-5 group"
              >
                <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
                Choose another portal
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${active!.chip} text-white flex items-center justify-center login-pop`}>
                  {portal === "admin" ? <ShieldCheck className="h-5 w-5" /> : <Headset className="h-5 w-5" />}
                </div>
                <div>
                  <div className="text-sm font-bold tracking-tight">{active!.title}</div>
                  <div className="text-[11px] text-muted-foreground">Welcome back — sign in below</div>
                </div>
              </div>

              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    placeholder={portal === "admin" ? "admin" : "your username"}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    autoFocus
                    className="h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      className="h-11 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 transition-all duration-300 hover:shadow-lg active:scale-[0.98]"
                  style={{ boxShadow: `0 10px 28px -12px ${active!.glow}` }}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign in
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </form>
            </div>

            <p className="text-center text-[11px] text-muted-foreground/60 mt-4">
              Trouble signing in? Ask your agency admin to check your access code.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
