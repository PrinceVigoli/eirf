export type CultureField = "dialect" | "tribe";
export interface CultureEntry { code: string; name: string }
export interface CultureOption { value: string; label: string }

export function cultureOptions(entries: CultureEntry[], field: CultureField, current = ""): CultureOption[] {
  const options = entries.map(({ code, name }) => {
    if (code === "086") return {
      value: field === "dialect" ? "Isnag" : "Isneg",
      label: field === "dialect" ? "Isnag (Isneg / Apayao)" : "Isneg (Isnag / Apayao)",
    };
    if (code === "180") name = field === "dialect" ? "Other local language/dialect" : "Other local ethnic group";
    if (code === "181") name = field === "dialect" ? "English" : "American";
    if (code === "182") name = field === "dialect" ? "Other foreign language" : "Other foreign ethnic group";
    return { value: name, label: name };
  });
  if (current && !options.some(option => option.value === current)) {
    options.push({ value: current, label: `${current} (saved value)` });
  }
  return options.sort((a, b) => a.label.localeCompare(b.label));
}
