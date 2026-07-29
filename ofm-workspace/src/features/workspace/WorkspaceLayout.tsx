import { NavLink, Outlet } from "react-router-dom";
import { Home, Settings, Trash2, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CurrentMember } from "@/features/auth/use-current-member";
import { PageTree } from "@/features/pages/PageTree";
import { DatabaseList } from "@/features/databases/DatabaseList";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { UserMenu } from "./UserMenu";

const navItem =
  "flex items-center gap-2 rounded-md px-2 h-8 text-sm font-medium transition-colors";

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    navItem,
    isActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
  );
}

export function WorkspaceLayout({ member }: { member: CurrentMember }) {
  const isOwner = member.role === "owner";

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar">
        <WorkspaceSwitcher />

        <div className="flex-1 overflow-y-auto p-2">
          <NavLink to="/" end className={navClass}>
            <Home className="size-4" /> Home
          </NavLink>
          <div className="mt-4">
            <PageTree />
          </div>
          <div className="mt-4">
            <DatabaseList />
          </div>
        </div>

        <div className="space-y-0.5 border-t p-2">
          {isOwner && (
            <>
              <NavLink to="/settings" className={navClass}>
                <Settings className="size-4" /> Settings
              </NavLink>
              <NavLink to="/team" className={navClass}>
                <Users className="size-4" /> Team
              </NavLink>
            </>
          )}
          <NavLink to="/trash" className={navClass}>
            <Trash2 className="size-4" /> Trash
          </NavLink>
          <UserMenu member={member} />
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
