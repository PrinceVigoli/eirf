import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface PublicSettings {
  stationName: string;
  stationShortName: string;
  reportTitle: string;
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return response.json();
}

export function usePublicSettings() {
  return useQuery({
    queryKey: ["public-settings"],
    queryFn: () => apiJson<PublicSettings>("/api/settings/public"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: PublicSettings) => apiJson<PublicSettings>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(settings),
    }),
    onSuccess: (settings) => queryClient.setQueryData(["public-settings"], settings),
  });
}

export function useSystemStatus() {
  return useQuery({
    queryKey: ["system-status"],
    queryFn: () => apiJson<any>("/api/system/status"),
    refetchInterval: 60_000,
  });
}

export function useLogIntegrity() {
  return useQuery({
    queryKey: ["log-integrity"],
    queryFn: () => apiJson<any>("/api/logs/integrity"),
    retry: false,
  });
}

export function cleanupOrphans() {
  return apiJson<{ removed: number }>("/api/system/cleanup-orphans", { method: "POST" });
}
