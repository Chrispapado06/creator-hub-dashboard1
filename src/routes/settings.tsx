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
import { Plus, Trash2, Copy, Check, Eye, EyeOff, Shield, MessageCircle, Sparkles, ExternalLink } from "lucide-react";
import { AgencyLogoUpload } from "@/components/AgencyLogoUpload";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Agency Console" }] }),
  component: SettingsPage,
});

type AgencySettings = {
  id: string;
  agency_name: string;
  logo_url: string | null;
  theme: string;
  anthropic_api_key: string | null;
};

type AccountType = "admin" | "staff";
type TeamUser = {
  id: string;
  username: string;
  password: string;
  label: string;
  active: boolean;
  account_type: AccountType;
  chatter_id: string | null;
  created_at: string;
};
type StaffMember = { id: string; name: string; role: string };

function SettingsPage() {
  const [settings, setSettings] = useState<AgencySettings | null>(null);
  const [form, setForm] = useState({ agency_name: "", logo_url: "", theme: "dark", anthropic_api_key: "" });
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [newUser, setNewUser] = useState({
    username: "", password: "", label: "",
    account_type: "admin" as AccountType,
    chatter_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const load = async () => {
    const [{ data: s }, { data: u }, { data: ch }] = await Promise.all([
      supabase.from("agency_settings").select("*").maybeSingle(),
      supabase.from("access_codes").select("*").order("created_at"),
      supabase.from("chatters").select("id, name, role").order("name"),
    ]);
    if (s) {
      setSettings(s as AgencySettings);
      setForm({
        agency_name: s.agency_name,
        logo_url: s.logo_url ?? "",
        theme: s.theme,
        anthropic_api_key: s.anthropic_api_key ?? "",
      });
    }
    setUsers((u ?? []) as TeamUser[]);
    setStaff((ch ?? []) as StaffMember[]);
  };

  useEffect(() => { load(); }, []);

  // Persist just the logo URL immediately so the sidebar updates without
  // requiring the user to click "Save settings".
  const persistLogo = async (newUrl: string | null) => {
    let error;
    if (settings?.id) {
      ({ error } = await supabase
        .from("agency_settings")
        .update({ logo_url: newUrl })
        .eq("id", settings.id));
    } else {
      ({ error } = await supabase.from("agency_settings").insert({
        agency_name: form.agency_name.trim() || "Agency Console",
        logo_url: newUrl,
        theme: form.theme,
      }));
    }
    if (error) return toast.error(error.message);
    window.dispatchEvent(new Event("agency-settings-updated"));
    load();
  };

  const onSave = async () => {
    setSaving(true);
    const payload = {
      agency_name: form.agency_name.trim() || "Agency Console",
      logo_url: form.logo_url.trim() || null,
      theme: form.theme,
      anthropic_api_key: form.anthropic_api_key.trim() || null,
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

  const onAddUser = async () => {
    const username = newUser.username.trim();
    const password = newUser.password;
    if (!username) return toast.error("Username is required");
    if (!password) return toast.error("Password is required");
    if (!newUser.label.trim()) return toast.error("Label is required");
    if (newUser.account_type === "staff" && !newUser.chatter_id) {
      return toast.error("Pick which staff member this account is for");
    }
    const { error } = await supabase.from("access_codes").insert({
      username,
      password,
      label: newUser.label.trim(),
      account_type: newUser.account_type,
      chatter_id: newUser.account_type === "staff" ? newUser.chatter_id : null,
    });
    if (error) return toast.error(error.message);
    toast.success("Team member added");
    setNewUser({ username: "", password: "", label: "", account_type: "admin", chatter_id: "" });
    setAddingUser(false);
    load();
  };

  const onToggleUser = async (id: string, active: boolean) => {
    const { error } = await supabase.from("access_codes").update({ active }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const onDeleteUser = async (id: string) => {
    const { error } = await supabase.from("access_codes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Team member removed");
    load();
  };

  const copyText = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const toggleReveal = (id: string) => {
    setRevealed((r) => ({ ...r, [id]: !r[id] }));
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
            <Label>Logo</Label>
            <AgencyLogoUpload
              value={form.logo_url || null}
              onChange={(url) => {
                setForm((f) => ({ ...f, logo_url: url ?? "" }));
                void persistLogo(url);
              }}
            />
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

      {/* AI */}
      <section className="space-y-5">
        <h2 className="text-lg font-semibold border-b border-border pb-2 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          AI weekly digest
        </h2>
        <p className="text-sm text-muted-foreground -mt-2">
          Paste an Anthropic API key here to enable the "AI weekly digest" button on the Daily dashboard.
          Each digest summarizes the last 7 days using Claude. Calls run from your browser — the key never leaves Supabase.
        </p>
        <div className="space-y-1.5">
          <Label>Anthropic API key</Label>
          <div className="flex gap-2">
            <Input
              type={showAnthropicKey ? "text" : "password"}
              placeholder="sk-ant-..."
              value={form.anthropic_api_key}
              onChange={(e) => setForm({ ...form, anthropic_api_key: e.target.value })}
              autoComplete="off"
              className="font-mono"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setShowAnthropicKey((v) => !v)}
              aria-label={showAnthropicKey ? "Hide API key" : "Show API key"}
            >
              {showAnthropicKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
          >
            Get an API key <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </section>

      <Button onClick={onSave} disabled={saving} className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90">
        {saving ? "Saving…" : "Save settings"}
      </Button>

      {/* Team accounts */}
      <section className="space-y-5">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h2 className="text-lg font-semibold">Team accounts</h2>
          <Button size="sm" variant="outline" onClick={() => setAddingUser(!addingUser)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New user
          </Button>
        </div>
        <p className="text-sm text-muted-foreground -mt-2">
          Create a username and password for each team member. Deactivate to revoke access instantly.
        </p>

        {addingUser && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Account type</Label>
                <Select
                  value={newUser.account_type}
                  onValueChange={(v) => setNewUser({ ...newUser, account_type: v as AccountType, chatter_id: "" })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin (full access)</SelectItem>
                    <SelectItem value="staff">Staff (clock in/out only)</SelectItem>
                  </SelectContent>
                </Select>
                <div className="text-[11px] text-muted-foreground">
                  {newUser.account_type === "admin"
                    ? "Sees the full agency console."
                    : "Sees only the staff portal — clock in/out, view their own shifts."}
                </div>
              </div>
              {newUser.account_type === "staff" && (
                <div className="space-y-1.5">
                  <Label>Linked staff member</Label>
                  <Select
                    value={newUser.chatter_id}
                    onValueChange={(v) => setNewUser({ ...newUser, chatter_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={staff.length === 0 ? "No staff yet — add one first" : "Pick"} />
                    </SelectTrigger>
                    <SelectContent>
                      {staff.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-[11px] text-muted-foreground">
                    Add staff on the Staff page first, then link a login here.
                  </div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Username</Label>
                <Input
                  placeholder="e.g. marissa"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input
                  type="text"
                  placeholder="Set a password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Label <span className="text-muted-foreground text-xs">(who is this for?)</span></Label>
                <Input
                  placeholder="e.g. Marissa Manager"
                  value={newUser.label}
                  onChange={(e) => setNewUser({ ...newUser, label: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={onAddUser}>Add user</Button>
              <Button size="sm" variant="ghost" onClick={() => setAddingUser(false)}>Cancel</Button>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-border">
          {users.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No users yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Username</th>
                  <th className="text-left font-medium px-4 py-3">Type</th>
                  <th className="text-left font-medium px-4 py-3">Password</th>
                  <th className="text-left font-medium px-4 py-3">Label</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isRevealed = !!revealed[u.id];
                  const userCopyKey = `u:${u.id}`;
                  const passCopyKey = `p:${u.id}`;
                  return (
                    <tr key={u.id} className="border-t border-border bg-card hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">{u.username}</span>
                          <button
                            onClick={() => copyText(userCopyKey, u.username)}
                            className="text-muted-foreground hover:text-primary transition-colors"
                            aria-label="Copy username"
                          >
                            {copied === userCopyKey ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        {u.account_type === "staff" && u.chatter_id && (
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            ↳ {staff.find((s) => s.id === u.chatter_id)?.name ?? "—"}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.account_type === "staff" ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-blue-500/30 bg-blue-500/10 text-blue-500">
                            <MessageCircle className="h-3 w-3" />
                            Staff
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary">
                            <Shield className="h-3 w-3" />
                            Admin
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">
                            {isRevealed ? u.password : "•".repeat(Math.max(8, Math.min(u.password.length, 12)))}
                          </span>
                          <button
                            onClick={() => toggleReveal(u.id)}
                            className="text-muted-foreground hover:text-primary transition-colors"
                            aria-label={isRevealed ? "Hide password" : "Show password"}
                          >
                            {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            onClick={() => copyText(passCopyKey, u.password)}
                            className="text-muted-foreground hover:text-primary transition-colors"
                            aria-label="Copy password"
                          >
                            {copied === passCopyKey ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{u.label || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={u.active}
                            onCheckedChange={(v) => onToggleUser(u.id, v)}
                          />
                          <span className={`text-xs ${u.active ? "text-success" : "text-muted-foreground"}`}>
                            {u.active ? "Active" : "Inactive"}
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
                              <AlertDialogTitle>Remove user {u.username}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Anyone signed in with this account will be logged out on their next page load.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => onDeleteUser(u.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
