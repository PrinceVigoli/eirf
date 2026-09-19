export const STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  open: ["open", "under_investigation", "closed", "settled"],
  under_investigation: ["under_investigation", "open", "closed", "settled"],
  settled: ["settled", "under_investigation", "closed"],
  closed: ["closed", "under_investigation", "archived"],
  archived: ["archived", "under_investigation"],
};

export function isAllowedStatusTransition(current: string, next: string): boolean {
  return STATUS_TRANSITIONS[current]?.includes(next) ?? false;
}
