import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { SessionProvider } from "@/auth/session";
import { OfflineFrame } from "@/offline/OfflineBanner";
import "./index.css";

// `OfflineFrame` is a passthrough unless the offline flag is set — it renders no
// element and no wrapper in a normal build. It sits outside the router so the
// banner is above every route, every gate and every error state.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OfflineFrame>
      <BrowserRouter>
        <SessionProvider>
          <App />
        </SessionProvider>
      </BrowserRouter>
    </OfflineFrame>
  </StrictMode>,
);
