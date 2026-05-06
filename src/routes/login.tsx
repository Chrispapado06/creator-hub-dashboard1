import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign In — Agency Console" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [agencyName, setAgencyName] = useState("Agency Console");

  useEffect(() => {
    // If already logged in, redirect home
    if (typeof window !== "undefined") {
      const session = localStorage.getItem("agency_session");
      if (session) navigate({ to: "/" });
    }
    // Load agency name for branding on login page
    supabase.from("agency_settings").select("agency_name, logo_url").maybeSingle().then(({ data }) => {
      if (data?.agency_name) setAgencyName(data.agency_name);
    });
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("access_codes")
      .select("id, code, active")
      .eq("code", code.trim().toUpperCase())
      .eq("active", true)
      .maybeSingle();
    setLoading(false);
    if (error || !data) {
      toast.error("Invalid or inactive access code.");
      return;
    }
    localStorage.setItem("agency_session", data.code);
    window.dispatchEvent(new Event("agency-auth-changed"));
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Toaster />
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-primary-glow shadow-[0_0_30px_oklch(0.72_0.18_30/0.4)] flex items-center justify-center">
              <KeyRound className="h-7 w-7 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{agencyName}</h1>
          <p className="text-sm text-muted-foreground">Enter your access code to continue</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="code">Access code</Label>
            <Input
              id="code"
              placeholder="XXXX-XXXX"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              autoFocus
              className="text-center tracking-widest uppercase text-base h-12"
            />
          </div>
          <Button type="submit" className="w-full h-11" disabled={loading}>
            {loading ? "Checking…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
