import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  // 5197, not 5195: cadence-crm already holds 5195 under strictPort and one of
  // the two would simply refuse to start.
  server: { port: 5197, strictPort: true, host: true },
});
