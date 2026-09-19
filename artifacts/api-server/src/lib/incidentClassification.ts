export type IncidentCategory = "crime" | "non_crime";

export function deriveCategory(type: string): IncidentCategory {
  return type === "Crime" ? "crime" : "non_crime";
}
