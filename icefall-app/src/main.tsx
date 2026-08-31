/*
 * `@/offline/seed` MUST STAY THE FIRST LOCAL IMPORT.
 *
 * It is a no-op unless the build was made with VITE_ICEFALL_OFFLINE=1. When it
 * is not a no-op it writes the sample athlete into localStorage, and it has to
 * do that BEFORE `settings/store.ts`, `social/posts.ts` and `social/summitLog.ts`
 * are evaluated, because each of those reads localStorage once at module load
 * and caches the result. Import order is execution order; moving this line down
 * would leave the offline profile blank with nothing to explain why.
 */
import "@/offline/seed";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { AppStateProvider } from "@/state/AppState";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AppStateProvider>
        <App />
      </AppStateProvider>
    </BrowserRouter>
  </StrictMode>,
);
