import { isValidIsoDate } from "./settledDate.ts";

export function validateReportedDate(dateReported: string, incidentDate: string, today: string):
  | { ok: true }
  | { ok: false; error: string } {
  if (!isValidIsoDate(dateReported)) return { ok: false, error: "dateReported must be a valid YYYY-MM-DD date" };
  if (dateReported > today) return { ok: false, error: "dateReported cannot be in the future" };
  if (isValidIsoDate(incidentDate) && dateReported < incidentDate) return { ok: false, error: "dateReported cannot be before the incident date" };
  return { ok: true };
}
