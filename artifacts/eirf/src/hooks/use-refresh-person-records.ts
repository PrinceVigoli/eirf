import { useQueryClient } from "@tanstack/react-query";
import { getListPersonsQueryKey, getListPersonLocationsQueryKey } from "@workspace/api-client-react";

export function useRefreshPersonRecords() {
  const client = useQueryClient();
  return () => Promise.all([
    client.invalidateQueries({ queryKey: getListPersonsQueryKey() }),
    client.invalidateQueries({ queryKey: getListPersonLocationsQueryKey() }),
  ]);
}
