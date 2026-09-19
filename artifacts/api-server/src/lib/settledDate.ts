const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function resolveSettledDate(
  nextStatus: string,
  suppliedDate: string | null | undefined,
  today: string,
): string | null {
  if (nextStatus !== "settled") return null;
  if (suppliedDate && isValidIsoDate(suppliedDate)) return suppliedDate;
  return today;
}
