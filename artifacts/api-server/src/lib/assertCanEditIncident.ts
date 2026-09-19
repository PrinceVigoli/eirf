/**
 * Owner-or-admin edit check for incidents. Extracted from the inline check
 * inside PATCH /incidents/:id (see incidents.ts) so the incident<->person
 * link/unlink routes can enforce the exact same rule instead of duplicating
 * it. Despite the "assert" name (kept to match the interface the D4 task
 * brief specifies) this returns a boolean rather than throwing — callers
 * are expected to turn a `false` into their own 403 response, since the
 * error message differs slightly by call site in practice.
 */
export interface EditableIncident {
  reportingOfficerId: number | null;
}

export interface EditingOfficer {
  id: number;
  role: string;
}

export function assertCanEditIncident(incident: EditableIncident, officer: EditingOfficer): boolean {
  const isOwner = incident.reportingOfficerId === officer.id;
  const isAdmin = officer.role === "admin";
  return isOwner || isAdmin;
}
