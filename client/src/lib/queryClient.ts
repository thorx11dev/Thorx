import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getApiOrigin } from "@/lib/apiOrigin";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    // API errors are JSON bodies like {"message": "..."} — surface the clean
    // message instead of the raw JSON blob so every caller's error.message
    // (toasts, etc.) reads as human text. Falls back to raw text if the body
    // isn't JSON (e.g. an HTML error page or empty body).
    let message = text;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.message === "string") {
        message = parsed.message;
      }
    } catch {
      // Not JSON — keep the raw text.
    }
    throw new Error(`${res.status}: ${message}`);
  }
}

/** Read the CSRF double-submit cookie set by the server. */
export function getCsrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)thorx\.csrf\.v2=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

const API_URL = getApiOrigin();

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(data ? { "Content-Type": "application/json" } : {}),
    ...extraHeaders,
  };

  if (UNSAFE_METHODS.has(method.toUpperCase())) {
    const csrf = getCsrfToken();
    if (csrf) headers["x-csrf-token"] = csrf;
  }

  const fullUrl = url.startsWith("/") ? `${API_URL}${url}` : `${API_URL}/${url}`;

  const res = await fetch(fullUrl, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
    async ({ queryKey }) => {
      const url = queryKey.join("/");
      const fullUrl = url.startsWith("/") ? `${API_URL}${url}` : `${API_URL}/${url}`;

      const res = await fetch(fullUrl, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
