import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WorkspaceState {
  /** The workspace the user is currently viewing. Null until resolved on boot. */
  currentWorkspaceId: string | null;
  setCurrentWorkspaceId: (id: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      currentWorkspaceId: null,
      setCurrentWorkspaceId: (id) => set({ currentWorkspaceId: id }),
    }),
    { name: "ofm-current-workspace" },
  ),
);

/** The active workspace id (reactive). Components re-render when it changes. */
export const useCurrentWorkspaceId = () =>
  useWorkspaceStore((s) => s.currentWorkspaceId);

/** Read the active workspace id outside React (e.g. in upload helpers). */
export const getCurrentWorkspaceId = () =>
  useWorkspaceStore.getState().currentWorkspaceId;
