import { useQuery } from "@tanstack/react-query";
import { createLocationOptions, type PhilippineLocations } from "@/lib/philippine-locations";

export function usePhilippineLocations() {
  return useQuery({
    queryKey: ["philippine-locations", "e360c9da"],
    queryFn: async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}data/philippine-locations.json?v=e360c9da`);
      if (!response.ok) throw new Error("Could not load Philippine locations");
      const data: PhilippineLocations = await response.json();
      return createLocationOptions(data);
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
