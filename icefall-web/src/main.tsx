import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "@/lib/auth";
import { OFFLINE } from "@/offline/offline";
import { OfflineBanner } from "@/offline/OfflineBanner";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        {/*
          Mounted HERE, outside <App/>, and deliberately not inside any screen:
          nothing the router renders can unmount it, so there is no route in the
          site on which the offline warning is absent.
        */}
        {OFFLINE && <OfflineBanner />}
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
