// Legacy statuses remain readable; new classifications use CASE_STATUSES.
export const CASE_STATUSES = ["under_investigation", "cleared", "solved"] as const;
export const ALL_STATUSES = [...CASE_STATUSES, "open", "settled", "closed", "archived"] as const;
export const STATUS_DESCRIPTIONS = {
  under_investigation: "Suspect unidentified and case not yet filed in prosecution.",
  cleared: "Case filed in prosecution; suspect not arrested.",
  solved: "Suspect arrested and case filed in prosecution.",
};
export function allowedNextStatuses(): string[] {
  return [...CASE_STATUSES];
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
    case "cleared":
      return { variant: "default", className: "bg-blue-100 text-blue-800 border-blue-300" };
    case "solved":
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
