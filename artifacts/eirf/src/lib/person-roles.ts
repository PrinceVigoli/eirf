// Single source of truth for the role a person can have on an incident
// (victim / complainant / suspect / witness). Keep in sync with:
//   - lib/db/src/schema/persons.ts (or wherever the personRoleEnum lives)
//   - lib/api-spec/openapi.yaml (#/components/schemas/PersonRole)
export const PERSON_ROLES = ["victim", "complainant", "suspect", "witness"] as const;

export type PersonRole = (typeof PERSON_ROLES)[number];

const ROLE_LABELS: Record<PersonRole, string> = {
  victim: "Victim",
  complainant: "Complainant",
  suspect: "Suspect",
  witness: "Witness",
};

export function roleLabel(role: PersonRole): string {
  return ROLE_LABELS[role];
}

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const ROLE_BADGE_VARIANTS: Record<PersonRole, BadgeVariant> = {
  suspect: "destructive",
  victim: "default",
  complainant: "secondary",
  witness: "outline",
};

export function roleBadgeVariant(role: PersonRole): BadgeVariant {
  return ROLE_BADGE_VARIANTS[role];
}
