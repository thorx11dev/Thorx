// ── THORX Store — client hooks ───────────────────────────────────────────────
// One query serves catalog + ownership + activation. Purchase/activate are
// mutations with optimistic cache writes; the server response is authoritative.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { captureEvent } from "@/lib/posthog";

export interface StoreItemDto {
  id: string;
  itemType: "theme" | "component";
  refKey: string;
  title: string;
  description: string;
  category: string;
  pricePoints: number;
  featured: boolean;
  version: number;
  owned: boolean;
}

export interface StoreResponse {
  items: StoreItemDto[];
  ownedItemIds: string[];
  active: { themeItemId: string | null; components: Record<string, string> };
}

export function useStore() {
  return useQuery<StoreResponse>({
    queryKey: QUERY_KEYS.store,
    staleTime: 30_000,
  });
}

export function usePurchaseStoreItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      // Idempotency key rotates per attempt — retries of THIS attempt reuse it
      // (the dialog stays open), a fresh attempt generates a fresh key.
      const key = crypto.randomUUID();
      const res = await apiRequest("POST", "/api/store/purchase", { itemId, idempotencyKey: key });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw Object.assign(new Error(err.message || "Purchase failed"), { code: err.error });
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      captureEvent("store_purchase", { item: data.item?.refKey, outcome: data.outcome });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.store });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.user }); // TX-Points balance display
      qc.invalidateQueries({ queryKey: QUERY_KEYS.sessionAuth });
    },
  });
}

export function useActivateStoreItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, deactivate = false }: { itemId: string; deactivate?: boolean }) => {
      const res = await apiRequest("POST", deactivate ? "/api/store/deactivate" : "/api/store/activate", { itemId });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw Object.assign(new Error(err.message || "Request failed"), { code: err.error });
      }
      return res.json();
    },
    onSuccess: () => {
      captureEvent("store_activate");
      qc.invalidateQueries({ queryKey: QUERY_KEYS.store });
    },
  });
}
