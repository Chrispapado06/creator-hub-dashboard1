import { Badge } from "@/components/ui/badge";
import type { AppRole } from "@/features/auth/use-current-member";

const LABEL: Record<AppRole, string> = {
  owner: "Owner",
  manager: "Manager",
  chatter: "Chatter",
};

export function RoleBadge({ role }: { role: AppRole }) {
  return (
    <Badge variant={role === "owner" ? "default" : "secondary"}>
      {LABEL[role]}
    </Badge>
  );
}
