import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Users, Activity, FileText, Search, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { CreatorAvatarUpload } from "@/components/CreatorAvatarUpload";
import { isMissingCreatorAvatarColumnError, normalizeCreatorFromDb } from "@/lib/creator-db";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Creators — Agency Console" },
      { name: "description", content: "All creators managed by the agency." },
    ],
  }),
  component: CreatorsPage,
});

type CreatorRow = {
  id: string;
  name: string;
  of_username: string | null;
  avatar_url: string | null;
  status: "active" | "paused" | "inactive";
  reddit_count: number;
  post_count: number;
  sub_dots: { name: string; color: "success" | "warning" | "destructive" }[];
  mtd_reddit: number;
  mtd_organic: number;
  mtd_internal: number;
  mtd_ads_net: number;
};

type PostSummary = {
  reddit_account_id: string;
  subreddit: string;
  upvotes: number;
  posted_at: string;
};

const statusStyles: Record<string, string> = {
  active: "bg-success/15 text-success border-success/30",
  paused: "bg-warning/15 text-warning border-warning/30",
  inactive: "bg-muted text-muted-foreground border-border",
};

const emptyForm = {
  name: "",
  of_username: "",
  status: "active" as "active" | "paused" | "inactive",
  avatar_url: null as string | null,
};

function CreatorsPage() {
  const [creators, setCreators] = useState<CreatorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CreatorRow | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    const { data: cs, error } = await supabase.from("creators").select("*").order("created_at", {
      ascending: false,
    });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const ids = (cs ?? []).map((c) => c.id);
    const counts: Record<string, { reddit: number; posts: number }> = {};
    if (ids.length) {
      const { data: ras } = await supabase
        .from("reddit_accounts")
        .select("id, creator_id")
        .in("creator_id", ids);
      const raIds = (ras ?? []).map((r) => r.id);
      // All-time post count
      const { data: ps } = raIds.length
        ? await supabase.from("posts").select("reddit_account_id").in("reddit_account_id", raIds)
        : { data: [] as { reddit_account_id: string }[] };
      // 7-day posts for health warnings + scorecard dots
      const since7d = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
      const { data: ps7d } = raIds.length
        ? await supabase
            .from("posts")
            .select("reddit_account_id, subreddit, upvotes, posted_at")
            .in("reddit_account_id", raIds)
            .gte("posted_at", since7d)
        : { data: [] as PostSummary[] };

      const raToCreator = new Map((ras ?? []).map((r) => [r.id, r.creator_id]));
      for (const c of cs ?? []) counts[c.id] = { reddit: 0, posts: 0 };
      for (const r of ras ?? []) counts[r.creator_id].reddit += 1;
      for (const p of ps ?? []) {
        const cid = raToCreator.get(p.reddit_account_id);
        if (cid && counts[cid]) counts[cid].posts += 1;
      }

      // MTD revenue queries
      const mtdStart = new Date();
      mtdStart.setDate(1);
      mtdStart.setHours(0, 0, 0, 0);
      const mtdStartStr = mtdStart.toISOString().slice(0, 10);
      const [{ data: revMtd }, { data: orgMtd }, { data: intMtd }, { data: adsMtd }] =
        await Promise.all([
          supabase
            .from("revenue_entries")
            .select("creator_id, amount")
            .in("creator_id", ids)
            .gte("entry_date", mtdStartStr),
          supabase
            .from("organic_entries")
            .select("creator_id, amount")
            .in("creator_id", ids)
            .gte("entry_date", mtdStartStr),
          supabase
            .from("internal_entries")
            .select("creator_id, amount")
            .in("creator_id", ids)
            .gte("entry_date", mtdStartStr),
          supabase
            .from("ad_campaigns")
            .select("creator_id, amount_spent, revenue_generated")
            .in("creator_id", ids)
            .gte("start_date", mtdStartStr),
        ]);
      const mtdReddit: Record<string, number> = {};
      const mtdOrganic: Record<string, number> = {};
      const mtdInternal: Record<string, number> = {};
      const mtdAdsNet: Record<string, number> = {};
      for (const e of revMtd ?? [])
        mtdReddit[e.creator_id] = (mtdReddit[e.creator_id] ?? 0) + e.amount;
      for (const e of orgMtd ?? [])
        mtdOrganic[e.creator_id] = (mtdOrganic[e.creator_id] ?? 0) + e.amount;
      for (const e of intMtd ?? [])
        mtdInternal[e.creator_id] = (mtdInternal[e.creator_id] ?? 0) + e.amount;
      for (const e of adsMtd ?? [])
        mtdAdsNet[e.creator_id] =
          (mtdAdsNet[e.creator_id] ?? 0) + (e.revenue_generated - e.amount_spent);

      // Compute scorecard dots per creator
      const creatorSubStats: Record<string, Record<string, { sum: number; count: number }>> = {};

      for (const p of (ps7d ?? []) as PostSummary[]) {
        const cid = raToCreator.get(p.reddit_account_id);
        if (!cid) continue;
        if (!creatorSubStats[cid]) creatorSubStats[cid] = {};
        if (!creatorSubStats[cid][p.subreddit])
          creatorSubStats[cid][p.subreddit] = { sum: 0, count: 0 };
        creatorSubStats[cid][p.subreddit].sum += p.upvotes;
        creatorSubStats[cid][p.subreddit].count++;
      }

      const subDots: Record<string, CreatorRow["sub_dots"]> = {};
      for (const c of cs ?? []) {
        const subMap = creatorSubStats[c.id] ?? {};
        const subList = Object.entries(subMap).map(([name, { sum, count }]) => ({
          name,
          avg: sum / count,
        }));
        if (subList.length > 0) {
          const creatorAvg = subList.reduce((s, x) => s + x.avg, 0) / subList.length;
          subDots[c.id] = subList
            .sort((a, b) => b.avg - a.avg)
            .slice(0, 8)
            .map((d) => ({
              name: d.name,
              color:
                d.avg >= creatorAvg
                  ? "success"
                  : d.avg >= creatorAvg * 0.5
                    ? "warning"
                    : "destructive",
            })) as CreatorRow["sub_dots"];
        } else {
          subDots[c.id] = [];
        }
      }

      setCreators(
        (cs ?? []).map((raw) => {
          const row = normalizeCreatorFromDb(raw);
          const c = row
            ? { ...row, status: row.status as CreatorRow["status"] }
            : (raw as unknown as CreatorRow);
          return {
            ...c,
            reddit_count: counts[c.id]?.reddit ?? 0,
            post_count: counts[c.id]?.posts ?? 0,
            sub_dots: subDots[c.id] ?? [],
            mtd_reddit: mtdReddit[c.id] ?? 0,
            mtd_organic: mtdOrganic[c.id] ?? 0,
            mtd_internal: mtdInternal[c.id] ?? 0,
            mtd_ads_net: mtdAdsNet[c.id] ?? 0,
          };
        }),
      );
    } else {
      setCreators(
        (cs ?? []).map((raw) => {
          const row = normalizeCreatorFromDb(raw);
          const c = row
            ? { ...row, status: row.status as CreatorRow["status"] }
            : (raw as unknown as CreatorRow);
          return {
            ...c,
            reddit_count: 0,
            post_count: 0,
            sub_dots: [],
            mtd_reddit: 0,
            mtd_organic: 0,
            mtd_internal: 0,
            mtd_ads_net: 0,
          };
        }),
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async () => {
    if (!addForm.name.trim()) return toast.error("Name is required");
    const baseInsert = {
      name: addForm.name.trim(),
      of_username: addForm.of_username.trim() || null,
      status: addForm.status as "active" | "paused" | "inactive",
    };
    let missingAvatarFallback = false;
    let { error } = await supabase.from("creators").insert({
      ...baseInsert,
      avatar_url: addForm.avatar_url,
    });
    if (error && isMissingCreatorAvatarColumnError(error)) {
      missingAvatarFallback = true;
      ({ error } = await supabase.from("creators").insert(baseInsert));
    }
    if (error) return toast.error(error.message);
    if (missingAvatarFallback && addForm.avatar_url) {
      toast.info(
        "Photos need the creators avatar migration in Supabase (`avatar_url` column + storage). Creator was added without a photo.",
        { duration: 8000 },
      );
    }
    toast.success("Creator added");
    setAddForm(emptyForm);
    setAddOpen(false);
    load();
  };

  const openEdit = (c: CreatorRow, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditTarget(c);
    setEditForm({
      name: c.name,
      of_username: c.of_username ?? "",
      status: c.status,
      avatar_url: c.avatar_url ?? null,
    });
    setEditOpen(true);
  };

  const onEdit = async () => {
    if (!editTarget) return;
    if (!editForm.name.trim()) return toast.error("Name is required");
    const baseUpdate = {
      name: editForm.name.trim(),
      of_username: editForm.of_username.trim() || null,
      status: editForm.status as "active" | "paused" | "inactive",
    };
    let missingAvatarFallback = false;
    let { error } = await supabase
      .from("creators")
      .update({ ...baseUpdate, avatar_url: editForm.avatar_url })
      .eq("id", editTarget.id);
    if (error && isMissingCreatorAvatarColumnError(error)) {
      missingAvatarFallback = true;
      ({ error } = await supabase.from("creators").update(baseUpdate).eq("id", editTarget.id));
    }
    if (error) return toast.error(error.message);
    if (missingAvatarFallback && editForm.avatar_url) {
      toast.info(
        "Photos need the creators avatar migration in Supabase (`avatar_url` column + storage). Other changes were saved.",
        { duration: 8000 },
      );
    }
    toast.success("Creator updated");
    setEditOpen(false);
    setEditTarget(null);
    load();
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("creators").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Creator deleted");
    load();
  };

  const filtered = creators.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.of_username ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const totalActive = creators.filter((c) => c.status === "active").length;
  const totalAccounts = creators.reduce((s, c) => s + c.reddit_count, 0);
  const totalPosts = creators.reduce((s, c) => s + c.post_count, 0);

  return (
    <div className="space-y-8">
      <Toaster />

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit creator</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Photo</Label>
              <CreatorAvatarUpload
                creatorId={editTarget?.id}
                value={editForm.avatar_url}
                name={editForm.name || "?"}
                onChange={(url) => setEditForm({ ...editForm, avatar_url: url })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>OnlyFans username</Label>
              <Input
                value={editForm.of_username}
                onChange={(e) => setEditForm({ ...editForm, of_username: e.target.value })}
                placeholder="lunarivers"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={editForm.status}
                onValueChange={(v) => setEditForm({ ...editForm, status: v as "active" | "paused" | "inactive" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Creators</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage all creators and their Reddit footprint.
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90 shadow-[0_0_20px_oklch(0.72_0.18_30/0.3)]">
              <Plus className="mr-1.5 h-4 w-4" />
              New creator
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a creator</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Photo</Label>
                <CreatorAvatarUpload
                  value={addForm.avatar_url}
                  name={addForm.name || "?"}
                  onChange={(url) => setAddForm({ ...addForm, avatar_url: url })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="Luna Rivers"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="of">OnlyFans username</Label>
                <Input
                  id="of"
                  value={addForm.of_username}
                  onChange={(e) => setAddForm({ ...addForm, of_username: e.target.value })}
                  placeholder="lunarivers"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={addForm.status}
                  onValueChange={(v) => setAddForm({ ...addForm, status: v as "active" | "paused" | "inactive" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button onClick={onCreate}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Active creators"
          value={totalActive}
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Reddit accounts"
          value={totalAccounts}
        />
        <StatCard
          icon={<FileText className="h-4 w-4" />}
          label="Tracked posts"
          value={totalPosts}
        />
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search creators…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl bg-card/60" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
          <p className="text-sm text-muted-foreground">No creators yet. Add your first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <div key={c.id} className="relative group">
              <Link
                to="/creators/$creatorId"
                params={{ creatorId: c.id }}
                className="block rounded-xl border border-border bg-[image:var(--gradient-surface)] p-5 transition-all hover:border-primary/50 hover:shadow-[var(--shadow-elegant)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {c.avatar_url ? (
                      <img
                        src={c.avatar_url}
                        alt=""
                        className="h-11 w-11 shrink-0 rounded-full object-cover border border-border"
                      />
                    ) : (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground font-semibold">
                        {c.name.charAt(0)}
                      </div>
                    )}
                    <div>
                      <div className="font-semibold leading-tight">{c.name}</div>
                      {c.of_username && (
                        <div className="text-xs text-muted-foreground">@{c.of_username}</div>
                      )}
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusStyles[c.status]}`}
                  >
                    {c.status}
                  </span>
                </div>
                <div className="mt-5 border-t border-border pt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground">Reddit accts</div>
                      <div className="text-lg font-semibold">{c.reddit_count}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Posts</div>
                      <div className="text-lg font-semibold">{c.post_count}</div>
                    </div>
                  </div>
                  {c.sub_dots.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Subs
                      </span>
                      {c.sub_dots.map((d, i) => (
                        <span
                          key={i}
                          title={`r/${d.name}`}
                          className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                            d.color === "success"
                              ? "bg-success"
                              : d.color === "warning"
                                ? "bg-warning"
                                : "bg-destructive"
                          }`}
                        />
                      ))}
                    </div>
                  )}
                  {c.mtd_reddit + c.mtd_organic + c.mtd_internal + c.mtd_ads_net > 0 &&
                    (() => {
                      const total = c.mtd_reddit + c.mtd_organic + c.mtd_internal + c.mtd_ads_net;
                      return (
                        <div>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                            <span className="uppercase tracking-wide">MTD Revenue</span>
                            <span className="font-medium text-foreground">
                              $
                              {total.toLocaleString("en-US", {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                              })}
                            </span>
                          </div>
                          <div className="h-2 rounded-full overflow-hidden flex bg-secondary">
                            {c.mtd_reddit > 0 && (
                              <div
                                className="h-full bg-primary"
                                style={{ width: `${(c.mtd_reddit / total) * 100}%` }}
                                title={`Reddit $${c.mtd_reddit.toFixed(0)}`}
                              />
                            )}
                            {c.mtd_organic > 0 && (
                              <div
                                className="h-full bg-success"
                                style={{ width: `${(c.mtd_organic / total) * 100}%` }}
                                title={`Organic $${c.mtd_organic.toFixed(0)}`}
                              />
                            )}
                            {c.mtd_internal > 0 && (
                              <div
                                className="h-full bg-warning"
                                style={{ width: `${(c.mtd_internal / total) * 100}%` }}
                                title={`Internal $${c.mtd_internal.toFixed(0)}`}
                              />
                            )}
                            {c.mtd_ads_net > 0 && (
                              <div
                                className="h-full bg-ads"
                                style={{ width: `${(c.mtd_ads_net / total) * 100}%` }}
                                title={`Ads net $${c.mtd_ads_net.toFixed(0)}`}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })()}
                </div>
              </Link>

              {/* Edit / Delete buttons — appear on hover */}
              <div className="absolute top-3 right-3 hidden group-hover:flex items-center gap-1 z-10">
                <button
                  onClick={(e) => openEdit(c, e)}
                  className="rounded-md bg-background/90 border border-border p-1.5 text-muted-foreground hover:text-foreground transition-colors shadow-sm"
                  title="Edit creator"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      className="rounded-md bg-background/90 border border-border p-1.5 text-muted-foreground hover:text-destructive transition-colors shadow-sm"
                      title="Delete creator"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {c.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete {c.name} and all their Reddit accounts, posts,
                        content, and revenue entries. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onDelete(c.id)}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}
