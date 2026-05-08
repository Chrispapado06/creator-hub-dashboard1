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
import { Plus, Trash2, Copy, Check, Eye, EyeOff, Shield, MessageCircle, Sparkles, ExternalLink, Lock, ShieldCheck, Save, X as XIcon } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { groupedAdminPages, ADMIN_PAGES, ADMIN_PAGE_GROUPS } from "@/lib/admin-pages";
import { AgencyLogoUpload } from "@/components/AgencyLogoUpload";
import { FormTemplatesManager } from "@/components/CreatorForms";
import { ClipboardList } from "lucide-react";
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
  airtable_api_key: string | null;
  default_max_shift_hours: number;
};

type AccountType = "admin" | "staff";
// allowed_pages convention:
//   null / empty array → super admin (full access, can manage other admins)
//   non-empty array     → restricted admin, only sees those page slugs
type TeamUser = {
  id: string;
  username: string;
  password: string;
  label: string;
  active: boolean;
  account_type: AccountType;
  chatter_id: string | null;
  allowed_pages: string[] | null;
  created_at: string;
};
type StaffMember = { id: string; name: string; role: string };

function SettingsPage() {
  const [settings, setSettings] = useState<AgencySettings | null>(null);
  const [form, setForm] = useState({ agency_name: "", logo_url: "", theme: "dark", anthropic_api_key: "", airtable_api_key: "", default_max_shift_hours: 8 });
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showAirtableKey, setShowAirtableKey] = useState(false);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [newUser, setNewUser] = useState({
    username: "", password: "", label: "",
    account_type: "admin" as AccountType,
    chatter_id: "",
    // "all" = full-access super admin, "restricted" = only the picked pages
    access_mode: "all" as "all" | "restricted",
    allowed_pages: [] as string[],
  });
  // Edit-access dialog for an existing admin
  const [editAccessFor, setEditAccessFor] = useState<TeamUser | null>(null);
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
        airtable_api_key: s.airtable_api_key ?? "",
        default_max_shift_hours: Number((s as AgencySettings).default_max_shift_hours ?? 8),
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
      airtable_api_key: form.airtable_api_key.trim() || null,
      // Clamp to a sane range so a typo doesn't lock staff out or
      // let them clock in for impossibly long shifts. 0.5h–24h.
      default_max_shift_hours: Math.max(0.5, Math.min(24, Number(form.default_max_shift_hours) || 8)),
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
    // Page access only matters for admin accounts. Staff always go to /clock.
    // For "all" → null (super admin); "restricted" → the picked slugs
    // (we send the array even if empty to mean "no pages" — a bit weird
    // but explicit; the UI prevents saving an empty restricted list).
    let allowedPages: string[] | null = null;
    if (newUser.account_type === "admin" && newUser.access_mode === "restricted") {
      if (newUser.allowed_pages.length === 0) {
        return toast.error("Pick at least one page for the restricted admin");
      }
      allowedPages = newUser.allowed_pages;
    }
    const { error } = await supabase.from("access_codes").insert({
      username,
      password,
      label: newUser.label.trim(),
      account_type: newUser.account_type,
      chatter_id: newUser.account_type === "staff" ? newUser.chatter_id : null,
      allowed_pages: allowedPages,
    });
    if (error) return toast.error(error.message);
    toast.success("Team member added");
    setNewUser({ username: "", password: "", label: "", account_type: "admin", chatter_id: "", access_mode: "all", allowed_pages: [] });
    setAddingUser(false);
    load();
  };

  const onSaveAccess = async (id: string, allowedPages: string[] | null) => {
    const { error } = await supabase.from("access_codes").update({ allowed_pages: allowedPages }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Page access updated");
    setEditAccessFor(null);
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

      {/* Integrations */}
      <section className="space-y-5">
        <h2 className="text-lg font-semibold border-b border-border pb-2 flex items-center gap-2">
          <ExternalLink className="h-4 w-4 text-primary" />
          Integrations
        </h2>
        <p className="text-sm text-muted-foreground -mt-2">
          Connect external services Bernard can read and write to. Tokens are stored in Supabase
          and called browser-direct — they never leave your project.
        </p>

        <div className="space-y-1.5">
          <Label>Airtable Personal Access Token</Label>
          <div className="flex gap-2">
            <Input
              type={showAirtableKey ? "text" : "password"}
              placeholder="patAbc..."
              value={form.airtable_api_key}
              onChange={(e) => setForm({ ...form, airtable_api_key: e.target.value })}
              autoComplete="off"
              className="font-mono"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setShowAirtableKey((v) => !v)}
              aria-label={showAirtableKey ? "Hide token" : "Show token"}
            >
              {showAirtableKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <div className="text-[11px] text-muted-foreground space-y-1">
            <p>
              Lets Bernard read your bases (when you ask) and write rows (with your approval).
              Generate a PAT at{" "}
              <a
                href="https://airtable.com/create/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-0.5"
              >
                airtable.com/create/tokens
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
              .
            </p>
            <p>Required scopes:</p>
            <ul className="list-disc list-inside ml-2 space-y-0.5">
              <li><code className="font-mono bg-secondary px-1 rounded text-[10px]">data.records:read</code> — read records</li>
              <li><code className="font-mono bg-secondary px-1 rounded text-[10px]">data.records:write</code> — create + update records</li>
              <li><code className="font-mono bg-secondary px-1 rounded text-[10px]">schema.bases:read</code> — list tables and fields</li>
            </ul>
            <p>Then add each base you want Bernard to access in the same form.</p>
          </div>
        </div>
      </section>

      {/* Staff settings — agency-wide shift limit. Per-chatter overrides
          live on the Chatters page. */}
      <section className="space-y-5">
        <h2 className="text-lg font-semibold border-b border-border pb-2 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          Staff settings
        </h2>
        <div className="space-y-2 max-w-md">
          <Label className="text-sm">
            Max shift length (hours)
          </Label>
          <Input
            type="number"
            min={0.5}
            max={24}
            step={0.5}
            value={form.default_max_shift_hours}
            onChange={(e) => setForm({ ...form, default_max_shift_hours: Number(e.target.value) })}
            className="max-w-[120px]"
          />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Default ceiling for any active shift. Staff get a warning at 30, 15,
            and 5 minutes left, plus a browser notification if they enabled them.
            Override per-chatter on the Staff page.
          </p>
        </div>
      </section>

      <Button onClick={onSave} disabled={saving} className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90">
        {saving ? "Saving…" : "Save settings"}
      </Button>

      {/* Form templates */}
      <section className="space-y-5">
        <h2 className="text-lg font-semibold border-b border-border pb-2 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          Form templates
        </h2>
        <FormTemplatesManager />
      </section>

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
            {/* Page access picker — only meaningful for admin accounts.
                Staff users always go to /clock regardless. */}
            {newUser.account_type === "admin" && (
              <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <Label className="text-xs flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-primary" /> Page access
                    </Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Pick which pages this admin can see.
                    </p>
                  </div>
                  <div className="inline-flex items-center rounded-md bg-card border border-border p-0.5">
                    <button
                      type="button"
                      onClick={() => setNewUser({ ...newUser, access_mode: "all", allowed_pages: [] })}
                      className={`text-[11px] px-2.5 py-1 rounded font-medium ${
                        newUser.access_mode === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Full access
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewUser({ ...newUser, access_mode: "restricted" })}
                      className={`text-[11px] px-2.5 py-1 rounded font-medium ${
                        newUser.access_mode === "restricted" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Restricted
                    </button>
                  </div>
                </div>
                {newUser.access_mode === "restricted" ? (
                  <PagePicker
                    value={newUser.allowed_pages}
                    onChange={(next) => setNewUser({ ...newUser, allowed_pages: next })}
                  />
                ) : (
                  <div className="text-[11px] text-muted-foreground italic flex items-center gap-1.5">
                    <ShieldCheck className="h-3 w-3 text-emerald-400" />
                    Sees the entire console — including Settings (can manage other admins).
                  </div>
                )}
              </div>
            )}
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
                        ) : !u.allowed_pages || u.allowed_pages.length === 0 ? (
                          <button
                            onClick={() => setEditAccessFor(u)}
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                            title="Click to restrict page access"
                          >
                            <ShieldCheck className="h-3 w-3" />
                            Super admin
                          </button>
                        ) : (
                          <button
                            onClick={() => setEditAccessFor(u)}
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                            title={`Sees ${u.allowed_pages.length} of ${ADMIN_PAGES.length} pages — click to edit`}
                          >
                            <Lock className="h-3 w-3" />
                            {u.allowed_pages.length} / {ADMIN_PAGES.length} pages
                          </button>
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

      {/* Edit-access dialog for an existing admin */}
      {editAccessFor && (
        <EditAccessDialog
          user={editAccessFor}
          onClose={() => setEditAccessFor(null)}
          onSave={(allowedPages) => onSaveAccess(editAccessFor.id, allowedPages)}
        />
      )}
    </div>
  );
}

// ── Page-permission picker (shared between Add User + Edit dialog) ──────

function PagePicker({
  value, onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const grouped = groupedAdminPages();
  const allSlugs = ADMIN_PAGES.map((p) => p.slug);

  const toggle = (slug: string) => {
    if (value.includes(slug)) onChange(value.filter((s) => s !== slug));
    else onChange([...value, slug]);
  };

  const toggleGroup = (groupSlugs: string[]) => {
    const allSelected = groupSlugs.every((s) => value.includes(s));
    if (allSelected) {
      onChange(value.filter((s) => !groupSlugs.includes(s)));
    } else {
      const next = new Set(value);
      groupSlugs.forEach((s) => next.add(s));
      onChange([...next]);
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {value.length} of {allSlugs.length} pages selected
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onChange(allSlugs)}
            className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {ADMIN_PAGE_GROUPS.map((group) => {
          const pages = grouped[group];
          const groupSlugs = pages.map((p) => p.slug);
          const allInGroup = groupSlugs.every((s) => value.includes(s));
          const someInGroup = groupSlugs.some((s) => value.includes(s));
          return (
            <div key={group} className="rounded-md bg-card border border-border p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </div>
                <button
                  type="button"
                  onClick={() => toggleGroup(groupSlugs)}
                  className="text-[10px] text-primary hover:underline"
                >
                  {allInGroup ? "Deselect group" : someInGroup ? "Select all" : "Select group"}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {pages.map((p) => {
                  const checked = value.includes(p.slug);
                  return (
                    <label
                      key={p.slug}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${
                        checked
                          ? "bg-primary/10 text-foreground border border-primary/30"
                          : "bg-secondary/30 text-muted-foreground hover:bg-secondary border border-transparent"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(p.slug)}
                        className="h-3.5 w-3.5 rounded border-border accent-primary"
                      />
                      <span className="truncate">{p.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Edit access dialog ──────────────────────────────────────────────────

function EditAccessDialog({
  user, onClose, onSave,
}: {
  user: TeamUser;
  onClose: () => void;
  onSave: (allowedPages: string[] | null) => void;
}) {
  const [accessMode, setAccessMode] = useState<"all" | "restricted">(
    !user.allowed_pages || user.allowed_pages.length === 0 ? "all" : "restricted",
  );
  const [allowedPages, setAllowedPages] = useState<string[]>(user.allowed_pages ?? []);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (accessMode === "restricted" && allowedPages.length === 0) {
      toast.error("Pick at least one page or switch to Full access");
      return;
    }
    setSaving(true);
    await onSave(accessMode === "all" ? null : allowedPages);
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            Page access — {user.username}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="inline-flex items-center rounded-md bg-secondary p-0.5">
            <button
              onClick={() => { setAccessMode("all"); setAllowedPages([]); }}
              className={`text-xs px-3 py-1.5 rounded font-medium ${
                accessMode === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5 inline mr-1" /> Full access
            </button>
            <button
              onClick={() => setAccessMode("restricted")}
              className={`text-xs px-3 py-1.5 rounded font-medium ${
                accessMode === "restricted" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Lock className="h-3.5 w-3.5 inline mr-1" /> Restricted
            </button>
          </div>
          {accessMode === "all" ? (
            <div className="text-xs text-muted-foreground italic flex items-center gap-1.5 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>This admin will see the entire console — including Settings, where they can manage other admins.</span>
            </div>
          ) : (
            <PagePicker value={allowedPages} onChange={setAllowedPages} />
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            <XIcon className="h-3.5 w-3.5 mr-1" /> Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1" /> {saving ? "Saving…" : "Save access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
