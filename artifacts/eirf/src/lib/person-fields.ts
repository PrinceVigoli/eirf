export const locationFields = [
  ["region", "Region"], ["province", "Province"],
  ["cityMunicipality", "City / Municipality"], ["barangay", "Barangay"], ["address", "Address"],
] as const;

export const nameFields = [["lastName", "Last Name"], ["middleName", "Middle Name"], ["firstName", "First Name"], ["alias", "Alias"], ["dialect", "Dialect"], ["tribe", "Tribe"]] as const;
export type LocationField = typeof locationFields[number][0];
export type NameField = "lastName" | "middleName" | "firstName";

export function fullNameFromParts(values: Partial<Record<NameField, string>>) {
  return [values.firstName, values.middleName, values.lastName].map(value => value?.trim()).filter(Boolean).join(" ");
}
