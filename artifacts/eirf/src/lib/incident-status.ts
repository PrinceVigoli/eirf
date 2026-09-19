// Allowed next statuses for each current status. Previously any status
// could move to any other status in any order (e.g. archived -> open),
// which most records-management systems don't allow — see B5 in the audit.
// The server enforces this same graph in
// artifacts/api-server/src/routes/incidents.ts (STATUS_TRANSITIONS); keep
// the two in sync if the workflow ever changes.
export const STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ["open", "under_investigation", "closed"],
  under_investigation: ["under_investigation", "open", "closed"],
  closed: ["closed", "under_investigation", "archived"],
  archived: ["archived", "under_investigation"],
};

export const ALL_STATUSES = ["open", "under_investigation", "closed", "archived"] as const;

export function allowedNextStatuses(current: string): string[] {
  return STATUS_TRANSITIONS[current] ?? ALL_STATUSES.slice();
}
