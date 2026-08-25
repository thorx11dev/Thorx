import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { initPosthog } from "@/lib/posthog";

initPosthog();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary scope="Application">
    <App />
  </ErrorBoundary>
);

// PWA service worker — PRODUCTION ONLY. In dev it would cache Vite's
// transform pipeline and break HMR; the SW itself also passes /api traffic
// through untouched (see client/public/sw.js).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[PWA] service worker registration skipped:", err);
    });
  });
}
