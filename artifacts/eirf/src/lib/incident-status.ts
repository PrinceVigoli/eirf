// Allowed next statuses for each current status. Previously any status
// could move to any other status in any order (e.g. archived -> open),
// which most records-management systems don't allow — see B5 in the audit.
// The server enforces this same graph in
// artifacts/api-server/src/lib/incidentWorkflow.ts (STATUS_TRANSITIONS); keep
// the two in sync if the workflow ever changes.
export const STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ["open", "under_investigation", "closed", "settled"],
  under_investigation: ["under_investigation", "open", "closed", "settled"],
  settled: ["settled", "under_investigation", "closed"],
  closed: ["closed", "under_investigation", "archived"],
  archived: ["archived", "under_investigation"],
};

export const ALL_STATUSES = ["open", "under_investigation", "settled", "closed", "archived"] as const;

export function allowedNextStatuses(current: string): string[] {
  return STATUS_TRANSITIONS[current] ?? ALL_STATUSES.slice();
}

// Human-readable label for a status value, e.g. "under_investigation" ->
// "Under Investigation". Centralized here — previously copy-pasted across
// incidents/index.tsx, incidents/detail.tsx, and dashboard.tsx.
export function getStatusLabel(status: string): string {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Matches the Badge component's `variant` prop (components/ui/badge.tsx),
// which only ships these four variants.
type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export interface StatusBadgeStyle {
  variant: BadgeVariant;
  className?: string;
}

// Badge styling for a status value. Centralized here — previously
// copy-pasted across incidents/index.tsx, incidents/detail.tsx, and
// dashboard.tsx (and slightly inconsistent: detail.tsx didn't special-case
// "archived", so an archived incident's badge looked like "default" there
// instead of "outline" as on the other two pages — this now matches the
// other two pages).
//
// The Badge component only ships 4 variants (default/secondary/destructive/
// outline) and isn't part of this task's file set, so "settled" reuses the
// "secondary" shape and layers a distinct emerald className on top rather
// than requiring a 5th native variant.
export function getStatusColor(status: string): StatusBadgeStyle {
  switch (status) {
    case "open":
      return { variant: "destructive" };
    case "under_investigation":
      return { variant: "secondary" };
    case "settled":
      return {
        variant: "secondary",
        className:
          "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
      };
    case "closed":
    case "archived":
      return { variant: "outline" };
    default:
      return { variant: "default" };
  }
}
