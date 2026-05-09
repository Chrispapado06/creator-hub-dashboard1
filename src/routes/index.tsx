import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Users, Activity, FileText, Search, Pencil, Trash2 } from "lucide-react";
import { CreatorRail } from "@/components/CreatorRail";
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
  /** OnlyFans-synced avatar (from of_creator_stats). Used as a fallback
   *  when the manually uploaded avatar_url is missing — same priority
   *  rule the OnlyFans page uses on its creator cards. */
  of_avatar_url: string | null;
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
      const [
        { data: revMtd },
        { data: orgMtd },
        { data: intMtd },
        { data: adsMtd },
        { data: ofStats },
      ] = await Promise.all([
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
        // OnlyFans-synced profile photos. Used as a fallback when the
        // manual avatar_url isn't set, so cards on the Creators tab show
        // the real OF profile picture (same behaviour as the OnlyFans
        // page). One row per creator — no need to dedupe.
        supabase
          .from("of_creator_stats")
          .select("creator_id, avatar_url")
          .in("creator_id", ids),
      ]);
      // Pre-bucket the OF avatars so we can merge them in below without
      // an O(n²) lookup in the map() that builds CreatorRow.
      const ofAvatarByCreator: Record<string, string | null> = {};
      for (const r of (ofStats ?? []) as Array<{ creator_id: string; avatar_url: string | null }>) {
        if (r.avatar_url) ofAvatarByCreator[r.creator_id] = r.avatar_url;
      }
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
            of_avatar_url: ofAvatarByCreator[c.id] ?? null,
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
            of_avatar_url: null,
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
    <div className="flex items-stretch min-h-full">
      {/* Creator rail — Golfy-style left list. Sits flush against the
          admin sidebar (no gap). Pass empty activeId so nothing is
          highlighted while we're on the overview; once a creator is
          picked, the page navigates to /creators/$id and that page's
          rail picks up the active highlight. */}
      <CreatorRail activeId="" />
      <div className="flex-1 min-w-0 px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-10 space-y-8">
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

      {/* Welcome / empty-state panel.
          The rail on the left is the primary nav now — pick a creator
          there to dive into their detail page. We keep the
          "New creator" button in the header above and surface the
          headline KPIs here as agency-wide overview. */}
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-primary/12 text-primary flex items-center justify-center mb-3">
          <Users className="h-6 w-6" />
        </div>
        <div className="text-base font-semibold">Pick a creator from the left</div>
        <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
          Search the rail or click any name to see their detail — Reddit accounts,
          posts, plan goals, payouts, and per-channel revenue.
        </p>
      </div>

      </div>
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
