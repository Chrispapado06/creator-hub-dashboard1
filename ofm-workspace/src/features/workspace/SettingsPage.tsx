import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2, UserPlus, X } from "lucide-react";

import {
  useCurrentMember,
  type AppRole,
} from "@/features/auth/use-current-member";
import { useCurrentWorkspaceId } from "@/stores/workspace-store";
import { useWorkspaces } from "./use-workspaces";
import { WorkspaceLogo } from "./WorkspaceLogo";
import {
  useAddWorkspaceMember,
  useRemoveWorkspaceMember,
  useUpdateWorkspace,
  useUploadWorkspaceLogo,
} from "./use-workspace-settings";
import { useSetMemberRole, useTeamMembers, type TeamMember } from "@/features/team/use-team";
import { IconPicker } from "@/features/pages/IconPicker";
import { RoleBadge } from "./role-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

const ROLES: AppRole[] = ["chatter", "manager", "owner"];

function GeneralSection() {
  const wsId = useCurrentWorkspaceId();
  const { data: workspaces = [] } = useWorkspaces();
  const current = workspaces.find((w) => w.id === wsId);

  const update = useUpdateWorkspace();
  const upload = useUploadWorkspaceLogo();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  useEffect(() => setName(current?.name ?? ""), [current?.name]);

  async function saveName() {
    const n = name.trim();
    if (!n || n === current?.name) return;
    try {
      await update.mutateAsync({ name: n });
      toast.success("Workspace name updated");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function pickIcon(icon: string) {
    try {
      await update.mutateAsync({ icon, logo_url: null });
      toast.success("Logo updated");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const url = await upload.mutateAsync(file);
      await update.mutateAsync({ logo_url: url, icon: null });
      toast.success("Logo updated");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function clearLogo() {
    try {
      await update.mutateAsync({ icon: null, logo_url: null });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const hasLogo = Boolean(current?.logoUrl || current?.icon);

  return (
    <section className="space-y-4 rounded-lg border p-5">
      <div>
        <h2 className="text-lg font-semibold">General</h2>
        <p className="text-sm text-muted-foreground">
          Your workspace logo and name — shown in the switcher for everyone.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <WorkspaceLogo
          name={current?.name ?? "W"}
          icon={current?.icon}
          logoUrl={current?.logoUrl}
          className="size-16 text-2xl"
          emojiClassName="text-3xl leading-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <IconPicker value={current?.icon} onPick={pickIcon}>
            <Button variant="outline" size="sm" disabled={update.isPending}>
              Choose emoji / brand
            </Button>
          </IconPicker>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending || update.isPending}
          >
            {upload.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ImagePlus className="size-4" />
            )}
            Upload image
          </Button>
          {hasLogo && (
            <Button variant="ghost" size="sm" onClick={clearLogo}>
              <X className="size-4" /> Remove
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFile}
          />
        </div>
      </div>

      <div className="max-w-sm space-y-1.5">
        <Label htmlFor="ws-name">Workspace name</Label>
        <div className="flex gap-2">
          <Input
            id="ws-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveName()}
          />
          <Button
            onClick={saveName}
            disabled={update.isPending || !name.trim() || name === current?.name}
          >
            Save
          </Button>
        </div>
      </div>
    </section>
  );
}

function AccessSection() {
  const { data: me } = useCurrentMember();
  const { data: members, isLoading } = useTeamMembers();
  const add = useAddWorkspaceMember();
  const remove = useRemoveWorkspaceMember();
  const setRole = useSetMemberRole();

  const [email, setEmail] = useState("");
  const [role, setRole2] = useState<AppRole>("chatter");

  async function addMember() {
    const e = email.trim();
    if (!e) return;
    try {
      await add.mutateAsync({ email: e, role });
      toast.success(`${e} can now see this workspace`);
      setEmail("");
      setRole2("chatter");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function changeRole(m: TeamMember, r: AppRole) {
    if (r === m.role) return;
    try {
      await setRole.mutateAsync({ userId: m.userId, role: r });
      toast.success(`${m.email} is now ${r}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function removeMember(m: TeamMember) {
    try {
      await remove.mutateAsync(m.userId);
      toast.success(`Removed ${m.email} from this workspace`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const active = (members ?? []).filter((m) => m.status === "active");

  return (
    <section className="space-y-4 rounded-lg border p-5">
      <div>
        <h2 className="text-lg font-semibold">Who can see this workspace</h2>
        <p className="text-sm text-muted-foreground">
          Only people added here can open this workspace. To add someone new to
          the whole team, invite them from Team first, then add them here.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 space-y-1.5" style={{ minWidth: 220 }}>
          <Label htmlFor="add-email">Add existing member by email</Label>
          <Input
            id="add-email"
            type="email"
            placeholder="teammate@agency.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addMember()}
          />
        </div>
        <Select value={role} onValueChange={(v) => setRole2(v as AppRole)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r} className="capitalize">
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={addMember} disabled={add.isPending || !email.trim()}>
          {add.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <UserPlus className="size-4" />
          )}
          Add
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead className="w-40">Role</TableHead>
              <TableHead className="w-24 text-right">Access</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={3}>
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </TableRow>
            ) : active.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="py-8 text-center text-muted-foreground"
                >
                  No one has access yet.
                </TableCell>
              </TableRow>
            ) : (
              active.map((m) => {
                const isSelf = me?.userId === m.userId;
                return (
                  <TableRow key={m.userId}>
                    <TableCell>
                      <div className="font-medium">
                        {m.fullName || "—"}
                        {isSelf && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (you)
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {m.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      {isSelf ? (
                        <RoleBadge role={m.role} />
                      ) : (
                        <Select
                          value={m.role}
                          onValueChange={(v) => changeRole(m, v as AppRole)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => (
                              <SelectItem
                                key={r}
                                value={r}
                                className="capitalize"
                              >
                                {r}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!isSelf && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          title="Remove from this workspace"
                          onClick={() => removeMember(m)}
                          disabled={remove.isPending}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const { data: me } = useCurrentMember();

  if (me && me.role !== "owner") {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-muted-foreground">
          Only workspace owners can change workspace settings.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Workspace settings
        </h1>
        <p className="text-muted-foreground">
          Branding and who can access this workspace.
        </p>
      </header>
      <GeneralSection />
      <AccessSection />
    </div>
  );
}
