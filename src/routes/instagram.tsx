import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, TrendingUp, Edit2, Check, X } from "lucide-react";
import { SiInstagram } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/instagram")({
  component: InstagramPage,
});

type Creator = { id: string; name: string; avatar_url: string | null };
type SocialAccount = {
  id: string;
  creator_id: string;
  platform: string;
  username: string | null;
  followers_count: number;
  following_count: number;
  posts_count: number;
  notes: string | null;
  updated_at: string;
};

type EditState = {
  username: string;
  followers_count: string;
  following_count: string;
  posts_count: string;
  notes: string;
};

function InstagramPage() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({
    username: "", followers_count: "", following_count: "", posts_count: "", notes: "",
  });

  const load = async () => {
    setLoading(true);
    const [{ data: cs }, { data: sas }] = await Promise.all([
      supabase.from("creators").select("id, name, avatar_url").order("name"),
      supabase.from("social_accounts").select("*").eq("platform", "instagram"),
    ]);
    setCreators((cs ?? []) as Creator[]);
    setAccounts((sas ?? []) as SocialAccount[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const accountFor = (cid: string) => accounts.find((a) => a.creator_id === cid) ?? null;

  const startEdit = (cid: string) => {
    const acct = accountFor(cid);
    setEditState({
      username: acct?.username ?? "",
      followers_count: acct?.followers_count?.toString() ?? "0",
      following_count: acct?.following_count?.toString() ?? "0",
      posts_count: acct?.posts_count?.toString() ?? "0",
      notes: acct?.notes ?? "",
    });
    setEditing(cid);
  };

  const saveEdit = async (cid: string) => {
    const existing = accountFor(cid);
    const payload = {
      creator_id: cid,
      platform: "instagram",
      username: editState.username.trim() || null,
      followers_count: parseInt(editState.followers_count) || 0,
      following_count: parseInt(editState.following_count) || 0,
      posts_count: parseInt(editState.posts_count) || 0,
      notes: editState.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (existing) {
      const { error } = await supabase.from("social_accounts").update(payload).eq("id", existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("social_accounts").insert(payload);
      if (error) return toast.error(error.message);
    }
    toast.success("Saved");
    setEditing(null);
    load();
  };

  const totalFollowers = accounts.reduce((s, a) => s + a.followers_count, 0);
  const connectedCount = creators.filter((c) => accountFor(c.id)).length;

  return (
    <div className="space-y-8">
      <Toaster />

      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <SiInstagram className="h-6 w-6" style={{ color: "#E1306C" }} />
          <h1 className="text-3xl font-bold tracking-tight">Instagram</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Track Instagram accounts and follower growth per creator. Update stats manually.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <Users className="h-4 w-4 text-primary" /> Total followers
          </div>
          <div className="text-2xl font-bold">{totalFollowers.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">across all connected accounts</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <SiInstagram className="h-4 w-4" style={{ color: "#E1306C" }} /> Connected
          </div>
          <div className="text-2xl font-bold">{connectedCount}</div>
          <div className="text-xs text-muted-foreground mt-1">of {creators.length} creators</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Avg followers
          </div>
          <div className="text-2xl font-bold">
            {connectedCount > 0
              ? Math.round(totalFollowers / connectedCount).toLocaleString()
              : "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">per account</div>
        </div>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-card/60 border border-border" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Creator</th>
                <th className="text-left font-medium px-4 py-3">Username</th>
                <th className="text-right font-medium px-4 py-3">Followers</th>
                <th className="text-right font-medium px-4 py-3">Following</th>
                <th className="text-right font-medium px-4 py-3">Posts</th>
                <th className="text-left font-medium px-4 py-3">Notes</th>
                <th className="text-left font-medium px-4 py-3">Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {creators.map((c) => {
                const acct = accountFor(c.id);
                const isEditing = editing === c.id;
                return (
                  <tr key={c.id} className="border-t border-border bg-card hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        to="/creators/$creatorId"
                        params={{ creatorId: c.id }}
                        className="flex items-center gap-2 hover:text-primary transition-colors"
                      >
                        {c.avatar_url ? (
                          <img src={c.avatar_url} className="h-6 w-6 rounded-full object-cover border border-border" alt={c.name} />
                        ) : (
                          <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold">
                            {c.name[0]}
                          </div>
                        )}
                        <span className="font-medium">{c.name}</span>
                      </Link>
                    </td>

                    {isEditing ? (
                      <>
                        <td className="px-4 py-2">
                          <Input
                            className="h-7 text-xs w-32"
                            placeholder="@username"
                            value={editState.username}
                            onChange={(e) => setEditState({ ...editState, username: e.target.value })}
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Input
                            className="h-7 text-xs w-24 text-right ml-auto"
                            type="number"
                            placeholder="0"
                            value={editState.followers_count}
                            onChange={(e) => setEditState({ ...editState, followers_count: e.target.value })}
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Input
                            className="h-7 text-xs w-24 text-right ml-auto"
                            type="number"
                            placeholder="0"
                            value={editState.following_count}
                            onChange={(e) => setEditState({ ...editState, following_count: e.target.value })}
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Input
                            className="h-7 text-xs w-20 text-right ml-auto"
                            type="number"
                            placeholder="0"
                            value={editState.posts_count}
                            onChange={(e) => setEditState({ ...editState, posts_count: e.target.value })}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            className="h-7 text-xs w-36"
                            placeholder="Notes"
                            value={editState.notes}
                            onChange={(e) => setEditState({ ...editState, notes: e.target.value })}
                          />
                        </td>
                        <td className="px-4 py-2" />
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => saveEdit(c.id)}
                              className="rounded p-1 hover:bg-success/20 text-success transition-colors"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setEditing(null)}
                              className="rounded p-1 hover:bg-secondary text-muted-foreground transition-colors"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-muted-foreground">
                          {acct?.username ? `@${acct.username}` : <span className="text-muted-foreground/40 italic">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {acct ? acct.followers_count.toLocaleString() : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {acct ? acct.following_count.toLocaleString() : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {acct ? acct.posts_count.toLocaleString() : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground max-w-[160px] truncate">
                          {acct?.notes ?? <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                          {acct ? format(new Date(acct.updated_at), "MMM d, yyyy") : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => startEdit(c.id)}
                            className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Stats are updated manually. Click the edit icon on any row to update follower counts and username.
      </p>
    </div>
  );
}
