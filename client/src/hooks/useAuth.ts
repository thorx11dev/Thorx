import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useState } from "react";
import { QUERY_KEYS } from "@/lib/queryKeys";

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  avatar: string;
  email: string;
  identity: string;
  phone: string;
  referralCode: string;
  totalEarnings: string;
  availableBalance: string;
  isActive: boolean;
  createdAt: string;
  role?: string;
  rank?: string;
  profilePicture?: string;
  permissions?: string[];
  referredBy?: string | null;
  // THORX v3 fields
  userRankTier?: string;
  guildRole?: string;
  guildId?: string | null;
  performanceScore?: number;
  streakDays?: number;
  txPointsBalance?: number;
  lastActiveAt?: string | null;
}

export function useAuth() {
  const [, setLocation] = useLocation();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: QUERY_KEYS.sessionAuth,
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/profile");
        if (!response.ok) return null;
        const text = await response.text();
        if (!text) return null;
        try {
          return JSON.parse(text) as User;
        } catch {
          return null;
        }
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      setIsTransitioning(true);
      await apiRequest("POST", "/api/logout").catch(() => {});
    },
    onSuccess: () => {
      setTimeout(() => {
        queryClient.setQueryData(QUERY_KEYS.sessionAuth, null);
        queryClient.clear();
        setIsTransitioning(false);
        setLocation("/");
      }, 600);
    },
    onError: () => {
      // Even on network failure, clear local session state so the UI is not
      // left in a ghost-login state (audit finding K).
      queryClient.setQueryData(QUERY_KEYS.sessionAuth, null);
      queryClient.clear();
      setIsTransitioning(false);
      setLocation("/");
    },
  });

  return {
    user: user ?? null,
    isAuthenticated: !!user,
    isLoading: isLoading || isTransitioning,
    error: null,
    logout: logoutMutation.mutate,
  };
}

export function useRequireAuth() {
  const auth = useAuth();
  return {
    ...auth,
    shouldRedirectToLogin: !auth.isLoading && !auth.isAuthenticated,
  };
}
