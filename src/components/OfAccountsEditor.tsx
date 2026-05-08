// Multi-OnlyFans-account editor for the creator detail / edit form.
//
// Each creator can have one primary OF account (lives on creators.of_username
// and is edited by the existing fields above) plus any number of secondary
// accounts (live in creator_of_accounts). This component is the secondary
// editor — admins use it to add a "free trial", "fetish persona", "OF
// backup" etc. and have OnlyFansAPI's earnings roll up under the same
// creator.
//
// On every render we list rows from creator_of_accounts where
// is_primary = false. The "Add account" button appends a row immediately
// (optimistic) and refreshes from the DB afterward. Sync picks up the
// new account on the next /onlyfans → "Sync now" run.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, RefreshCw, Link2 } from "lucide-react";
import { toast } from "sonner";

type Row = {
  id: string;
  of_username: string;
  onlyfansapi_acct_id: string | null;
  label: string | null;
  is_primary: boolean;
};

export function OfAccountsEditor({ creatorId }: { creatorId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("creator_of_accounts")
      .select("id, of_username, onlyfansapi_acct_id, label, is_primary")
      .eq("creator_id", creatorId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [creatorId]);

  const onAdd = async () => {
    const username = newUsername.trim().replace(/^@/, "");
    if (!username) return toast.error("OF username is required");
    if (rows.some((r) => r.of_username.toLowerCase() === username.toLowerCase())) {
      return toast.error("That username is already on this creator");
    }
    setAdding(true);
    const { error } = await supabase
      .from("creator_of_accounts")
      .insert({
        creator_id: creatorId,
        of_username: username,
        label: newLabel.trim() || null,
        is_primary: false,
      });
    setAdding(false);
    if (error) return toast.error(error.message);
    toast.success(`Added @${username}. Hit Sync to pull its earnings.`);
    setNewUsername("");
    setNewLabel("");
    void load();
  };

  const onDelete = async (id: string) => {
    if (!confirm("Remove this OF account from the creator? Its earnings stop rolling up.")) return;
    const { error } = await supabase
      .from("creator_of_accounts")
      .delete()
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    void load();
  };

  const onUpdateLabel = async (id: string, label: string) => {
    await supabase
      .from("creator_of_accounts")
      .update({ label: label.trim() || null })
      .eq("id", id);
  };

  const secondary = rows.filter((r) => !r.is_primary);

  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-secondary/20 p-3">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs font-semibold flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5 text-primary" />
            Additional OF accounts
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Run multiple OF pages? Add them here. Earnings roll up under this creator.
          </p>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {loading ? "Loading…" : `${secondary.length} secondary`}
        </span>
      </div>

      {/* Existing secondary rows */}
      {secondary.length > 0 && (
        <div className="space-y-1.5">
          {secondary.map((r) => (
            <div key={r.id} className="rounded-md border border-border bg-card p-2 flex items-center gap-2 text-xs">
              <span className="font-mono text-foreground">@{r.of_username}</span>
              <Input
                defaultValue={r.label ?? ""}
                placeholder="label (e.g. free, fetish)"
                className="h-7 text-[11px] flex-1"
                onBlur={(e) => void onUpdateLabel(r.id, e.target.value)}
              />
              <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                r.onlyfansapi_acct_id
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                  : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
              }`}>
                {r.onlyfansapi_acct_id ? "connected" : "needs sync"}
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => void onDelete(r.id)}
                className="h-7 w-7 text-muted-foreground hover:text-rose-400"
                aria-label="Remove account"
                title="Remove account"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add row */}
      <div className="flex items-center gap-2">
        <Input
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          placeholder="of_username"
          className="h-8 text-xs flex-1"
          onKeyDown={(e) => { if (e.key === "Enter") void onAdd(); }}
        />
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="label (optional)"
          className="h-8 text-xs w-32"
          onKeyDown={(e) => { if (e.key === "Enter") void onAdd(); }}
        />
        <Button
          size="sm"
          onClick={() => void onAdd()}
          disabled={adding || !newUsername.trim()}
          className="h-8 shrink-0"
        >
          {adding ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          <span className="ml-1 text-xs">Add</span>
        </Button>
      </div>
    </div>
  );
}
