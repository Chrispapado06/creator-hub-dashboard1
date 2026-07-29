import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";

import {
  useCurrentMember,
  type AppRole,
} from "@/features/auth/use-current-member";
import {
  useInviteMember,
  useSetMemberActive,
  useSetMemberRole,
  useTeamMembers,
  type TeamMember,
} from "./use-team";
import { RoleBadge } from "@/features/workspace/role-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";

const inviteSchema = z.object({
  email: z.email("Enter a valid email"),
  role: z.enum(["owner", "manager", "chatter"]),
});
type InviteValues = z.infer<typeof inviteSchema>;

function InviteDialog() {
  const [open, setOpen] = useState(false);
  const invite = useInviteMember();
  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "chatter" },
  });

  async function onSubmit(values: InviteValues) {
    try {
      await invite.mutateAsync(values);
      toast.success(`Invite sent to ${values.email}`);
      form.reset({ email: "", role: "chatter" });
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" /> Invite member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
          <DialogDescription>
            They'll get an email to set their password and join the workspace.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            id="invite-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="teammate@agency.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="chatter">Chatter</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="owner">Owner</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button type="submit" form="invite-form" disabled={invite.isPending}>
            {invite.isPending && <Loader2 className="size-4 animate-spin" />}
            Send invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TeamPage() {
  const { data: me } = useCurrentMember();
  const { data: members, isLoading } = useTeamMembers();
  const setRole = useSetMemberRole();
  const setActive = useSetMemberActive();

  async function changeRole(m: TeamMember, role: AppRole) {
    if (role === m.role) return;
    try {
      await setRole.mutateAsync({ userId: m.userId, role });
      toast.success(`${m.email} is now ${role}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function toggleActive(m: TeamMember) {
    const action = m.status === "active" ? "deactivate" : "reactivate";
    try {
      await setActive.mutateAsync({ userId: m.userId, action });
      toast.success(`${m.email} ${action}d`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // Team management is owner-only (server-enforced too). Friendly gate for
  // managers/chatters who navigate here directly.
  if (me && me.role !== "owner") {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="mt-2 text-muted-foreground">
          Only workspace owners can manage the team.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-muted-foreground">
            Invite members, set roles, and manage access.
          </p>
        </div>
        <InviteDialog />
      </header>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead className="w-40">Role</TableHead>
              <TableHead className="w-32">Status</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={4}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : (members ?? []).length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-8 text-center text-muted-foreground"
                >
                  No members yet. Invite your first teammate.
                </TableCell>
              </TableRow>
            ) : (
              (members ?? []).map((m) => {
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
                            <SelectItem value="chatter">Chatter</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="owner">Owner</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={m.status === "active" ? "secondary" : "outline"}
                        className={
                          m.status === "active" ? "" : "text-muted-foreground"
                        }
                      >
                        {m.status === "active" ? "Active" : "Deactivated"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {!isSelf && (
                        <Button
                          variant={m.status === "active" ? "outline" : "default"}
                          size="sm"
                          onClick={() => toggleActive(m)}
                          disabled={setActive.isPending}
                        >
                          {m.status === "active" ? "Deactivate" : "Reactivate"}
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
    </div>
  );
}
