import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Plus, Trash2, Copy, Check } from "lucide-react";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Agency Console" }] }),
  component: SettingsPage,
});

type AgencySettings = {
  id: string;
  agency_name: string;
  logo_url: string | null;
  theme: string;
};

type AccessCode = {
  id: string;
  code: string;
  label: string;
  active: boolean;
  created_at: string;
};

function SettingsPage() {
  const [settings, setSettings] = useState<AgencySettings | null>(null);
  const [form, setForm] = useState({ agency_name: "", logo_url: "", theme: "dark" });
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [newCode, setNewCode] = useState({ code: "", label: "" });
  const [saving, setSaving] = useState(false);
  const [addingCode, setAddingCode] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    const [{ data: s }, { data: c }] = await Promise.all([
      supabase.from("agency_settings").select("*").maybeSingle(),
      supabase.from("access_codes").select("*").order("created_at"),
    ]);
    if (s) {
      setSettings(s as AgencySettings);
      setForm({ agency_name: s.agency_name, logo_url: s.logo_url ?? "", theme: s.theme });
    }
    setCodes((c ?? []) as AccessCode[]);
  };

  useEffect(() => { load(); }, []);

  const onSave = async () => {
    setSaving(true);
    const payload = {
      agency_name: form.agency_name.trim() || "Agency Console",
      logo_url: form.logo_url.trim() || null,
      theme: form.theme,
    };
    let error;
    if (settings?.id) {
      ({ error } = await supabase.from("agency_settings").update(payload).eq("id", settings.id));
    } else {
      ({ error } = await supabase.from("agency_settings").insert(payload));
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    // Apply theme immediately
    localStorage.setItem("agency_theme", form.theme);
    if (form.theme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }
    window.dispatchEvent(new Event("agency-settings-updated"));
    toast.success("Settings saved");
    load();
  };

  const onAddCode = async () => {
    const clean = newCode.code.trim().toUpperCase();
    if (!clean) return toast.error("Code is required");
    if (!newCode.label.trim()) return toast.error("Label is required");
    const { error } = await supabase.from("access_codes").insert({
      code: clean,
      label: newCode.label.trim(),
    });
    if (error) return toast.error(error.message);
    toast.success("Access code added");
    setNewCode({ code: "", label: "" });
    setAddingCode(false);
    load();
  };

  const onToggleCode = async (id: string, active: boolean) => {
    const { error } = await supabase.from("access_codes").update({ active }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const onDeleteCode = async (id: string) => {
    const { error } = await supabase.from("access_codes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Code deleted");
    load();
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-10 max-w-2xl">
      <Toaster />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your agency branding and team access.</p>
      </div>

      {/* Branding */}
      <section className="space-y-5">
        <h2 className="text-lg font-semibold border-b border-border pb-2">Branding</h2>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Agency name</Label>
            <Input
              value={form.agency_name}
              onChange={(e) => setForm({ ...form, agency_name: e.target.value })}
              placeholder="My Agency"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Logo URL <span className="text-muted-foreground text-xs">(paste a public image link)</span></Label>
            <Input
              value={form.logo_url}
              onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
              placeholder="https://..."
            />
            {form.logo_url && (
              <div className="mt-2 flex items-center gap-3">
                <img
                  src={form.logo_url}
                  alt="Logo preview"
                  className="h-10 w-10 rounded-lg object-cover border border-border"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
                <span className="text-xs text-muted-foreground">Preview</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Theme */}
      <section className="space-y-5">
        <h2 className="text-lg font-semibold border-b border-border pb-2">Theme</h2>
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div>
            <div className="font-medium text-sm">Light mode</div>
            <div className="text-xs text-muted-foreground mt-0.5">Switch to a white / light interface</div>
          </div>
          <Switch
            checked={form.theme === "light"}
            onCheckedChange={(v) => setForm({ ...form, theme: v ? "light" : "dark" })}
          />
        </div>
      </section>

      <Button onClick={onSave} disabled={saving} className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90">
        {saving ? "Saving…" : "Save branding & theme"}
      </Button>

      {/* Access Codes */}
      <section className="space-y-5">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h2 className="text-lg font-semibold">Access codes</h2>
          <Button size="sm" variant="outline" onClick={() => setAddingCode(!addingCode)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New code
          </Button>
        </div>
        <p className="text-sm text-muted-foreground -mt-2">
          Share a code with a team member so they can sign in. Deactivate to revoke access instantly.
        </p>

        {addingCode && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Code <span className="text-muted-foreground text-xs">(auto-uppercased)</span></Label>
                <Input
                  placeholder="TEAM-2024"
                  value={newCode.code}
                  onChange={(e) => setNewCode({ ...newCode, code: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Label <span className="text-muted-foreground text-xs">(who is this for?)</span></Label>
                <Input
                  placeholder="e.g. Marissa Manager"
                  value={newCode.label}
                  onChange={(e) => setNewCode({ ...newCode, label: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={onAddCode}>Add code</Button>
              <Button size="sm" variant="ghost" onClick={() => setAddingCode(false)}>Cancel</Button>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-border">
          {codes.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No codes yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Code</th>
                  <th className="text-left font-medium px-4 py-3">Label</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id} className="border-t border-border bg-card hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">{c.code}</span>
                        <button
                          onClick={() => copyCode(c.code)}
                          className="text-muted-foreground hover:text-primary transition-colors"
                        >
                          {copied === c.code ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.label || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={c.active}
                          onCheckedChange={(v) => onToggleCode(c.id, v)}
                        />
                        <span className={`text-xs ${c.active ? "text-success" : "text-muted-foreground"}`}>
                          {c.active ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete code {c.code}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Anyone signed in with this code will be logged out on their next page load.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onDeleteCode(c.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
