export const CASE_STATUSES = ["under_investigation", "cleared", "solved"] as const;
export const STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  "open": [
    "open",
    "under_investigation",
    "cleared",
    "solved"
  ],
  "settled": [
    "settled",
    "under_investigation",
    "cleared",
    "solved"
  ],
  "closed": [
    "closed",
    "under_investigation",
    "cleared",
    "solved"
  ],
  "archived": [
    "archived",
    "under_investigation",
    "cleared",
    "solved"
  ],
  "under_investigation": [
    "under_investigation",
    "cleared",
    "solved"
  ],
  "cleared": [
    "cleared",
    "under_investigation",
    "solved"
  ],
  "solved": [
    "solved",
    "under_investigation",
    "cleared"
  ]
};

export function isAllowedStatusTransition(current: string, next: string): boolean {
  return STATUS_TRANSITIONS[current]?.includes(next) ?? false;
}
