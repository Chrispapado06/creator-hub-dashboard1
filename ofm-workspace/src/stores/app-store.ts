import { create } from "zustand";

/**
 * Lightweight UI state that doesn't belong in the server cache (TanStack Query).
 * Server data lives in Query; ephemeral view state lives here.
 */
interface AppState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  commandMenuOpen: boolean;
  setCommandMenuOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  commandMenuOpen: false,
  setCommandMenuOpen: (open) => set({ commandMenuOpen: open }),
}));
