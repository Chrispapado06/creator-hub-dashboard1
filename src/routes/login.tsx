import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { LockKeyhole, Eye, EyeOff } from "lucide-react";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign In — Agency Console" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agencyName, setAgencyName] = useState("Agency Console");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const session = localStorage.getItem("agency_session");
      if (session) navigate({ to: "/" });
    }
    supabase.from("agency_settings").select("agency_name, logo_url").maybeSingle().then(({ data }) => {
      if (data?.agency_name) setAgencyName(data.agency_name);
    });
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    const p = password;
    if (!u || !p) {
      toast.error("Username and password are required.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("access_codes")
      .select("id, username, password, active, account_type, chatter_id")
      .eq("username", u)
      .eq("password", p)
      .eq("active", true)
      .maybeSingle();
    setLoading(false);
    if (error || !data) {
      toast.error("Invalid username or password.");
      return;
    }
    const session = JSON.stringify({
      username: data.username,
      type: data.account_type ?? "admin",
      chatter_id: data.chatter_id ?? null,
    });
    localStorage.setItem("agency_session", session);
    void logAudit({
      action: "login",
      entity_type: "session",
      entity_name: data.username,
      details: data.account_type === "staff" ? "staff portal" : "admin",
    });
    window.dispatchEvent(new Event("agency-auth-changed"));
    navigate({ to: data.account_type === "staff" ? "/clock" : "/" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Toaster />
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-primary-glow shadow-[0_0_30px_oklch(0.72_0.18_30/0.4)] flex items-center justify-center">
              <LockKeyhole className="h-7 w-7 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{agencyName}</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              placeholder="admin"
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
          <Button type="submit" className="w-full h-11" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
