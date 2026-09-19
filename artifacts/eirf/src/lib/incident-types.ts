// Single source of truth for the incident `type` values on the frontend.
// Must stay in sync with:
//   - lib/db/src/schema/incidents.ts (incidentTypeEnum)
//   - lib/api-spec/openapi.yaml (#/components/schemas/IncidentType)
// Previously this list was copy-pasted into new.tsx, edit.tsx, and
// index.tsx independently, and the server accepted any string at all —
// see U4/B4 in the security & UX audit. `type` is now a real enum end to
// end, so an off-list value is rejected before it can reach the database.
export const INCIDENT_TYPES = ["Crime", "Accident", "Dispute", "Missing Person", "Other"] as const;

export type IncidentType = (typeof INCIDENT_TYPES)[number];
