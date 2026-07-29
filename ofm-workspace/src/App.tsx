import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-context";
import { useCurrentMember } from "@/features/auth/use-current-member";
import { useDeepLinkAuth } from "@/features/auth/use-deep-link-auth";
import { useAppUpdater } from "@/features/app/use-updater";
import { useWorkspaces } from "@/features/workspace/use-workspaces";
import {
  useCurrentWorkspaceId,
  useWorkspaceStore,
} from "@/stores/workspace-store";
import { FullScreenSpinner } from "@/components/full-screen-spinner";
import ConfigNeeded from "@/features/auth/ConfigNeeded";
import NoAccessScreen from "@/features/auth/NoAccessScreen";
import LoginPage from "@/features/auth/LoginPage";
import AcceptInvitePage from "@/features/auth/AcceptInvitePage";
import { WorkspaceLayout } from "@/features/workspace/WorkspaceLayout";
import HomePage from "@/features/workspace/HomePage";
import TeamPage from "@/features/team/TeamPage";
import SettingsPage from "@/features/workspace/SettingsPage";
import PageEditor from "@/features/pages/PageEditor";
import TrashPage from "@/features/pages/TrashPage";
import DatabasePage from "@/features/databases/DatabasePage";

/** Redirects already-authenticated users away from the login screen. */
function LoginRoute() {
  const { session, loading } = useAuth();
  if (loading) return <FullScreenSpinner />;
  if (session) return <Navigate to="/" replace />;
  return <LoginPage />;
}

/** Ensures a valid current workspace is selected before loading the workspace. */
function WorkspaceGate() {
  const { data: workspaces, isLoading, isError } = useWorkspaces();
  const currentId = useCurrentWorkspaceId();
  const setCurrent = useWorkspaceStore((s) => s.setCurrentWorkspaceId);

  useEffect(() => {
    if (!workspaces || workspaces.length === 0) return;
    const valid = currentId && workspaces.some((w) => w.id === currentId);
    if (!valid) setCurrent(workspaces[0].id);
  }, [workspaces, currentId, setCurrent]);

  if (isLoading) return <FullScreenSpinner label="Loading your workspaces…" />;
  if (isError || !workspaces || workspaces.length === 0)
    return <NoAccessScreen />;
  if (!currentId || !workspaces.some((w) => w.id === currentId))
    return <FullScreenSpinner />;
  return <MemberGate />;
}

/** Loads the caller's membership in the current workspace. */
function MemberGate() {
  const { data: member, isLoading, isError } = useCurrentMember();
  if (isLoading) return <FullScreenSpinner label="Loading your workspace…" />;
  // A query error here means RLS denied everything (deactivated / no membership).
  if (isError || !member || member.status !== "active")
    return <NoAccessScreen />;
  return <WorkspaceLayout member={member} />;
}

/** Session gate wrapping the whole workspace. */
function ProtectedShell() {
  const location = useLocation();
  const { session, loading } = useAuth();
  if (loading) return <FullScreenSpinner />;
  if (!session)
    return <Navigate to="/login" replace state={{ from: location }} />;
  return <WorkspaceGate />;
}

export default function App() {
  useDeepLinkAuth();
  useAppUpdater();

  if (!isSupabaseConfigured) return <ConfigNeeded />;

  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/auth/callback" element={<AcceptInvitePage />} />
      <Route element={<ProtectedShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/page/:pageId" element={<PageEditor />} />
        <Route path="/db/:databaseId" element={<DatabasePage />} />
        <Route path="/trash" element={<TrashPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
