import { lazy, type ComponentType } from "react";

/**
 * Dev-mode self-healing lazy().
 *
 * The dev proxy occasionally drops a dynamically imported module request
 * ("Failed to fetch dynamically imported module: ..."). The module itself is
 * fine (it serves 200) — the failure is a transient network/proxy hiccup.
 *
 * This wraps React.lazy so the loader retries the import a couple of times
 * with a small delay before giving up. A retry re-issues the module request,
 * which succeeds the moment the proxy is healthy again — no page reload
 * needed, no error boundary flash.
 */
export function retryLazy<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy<T>(() =>
    factory().catch((error) => {
      console.warn("[retryLazy] module fetch failed, retrying…", error);
      return new Promise<{ default: T }>((resolve, reject) => {
        setTimeout(() => {
          factory()
            .then(resolve)
            .catch((secondError) => {
              console.warn("[retryLazy] retry failed, retrying once more…", secondError);
              setTimeout(() => {
                factory().then(resolve).catch(reject);
              }, 800);
            });
        }, 300);
      });
    })
  );
}
