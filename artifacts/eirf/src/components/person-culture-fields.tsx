import { useId } from "react";
import { Label } from "@/components/ui/label";
import { ChevronDown } from "lucide-react";
import dataset from "@/data/philippine-culture.json";
import { cultureOptions } from "@/lib/person-culture";

export function PersonCultureFields({ values, onChange, search = false }: {
  values: { dialect?: string; tribe?: string };
  onChange: (field: "dialect" | "tribe", value: string) => void;
  search?: boolean;
}) {
  const id = useId();
  return <div className="space-y-2">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
    {([ ["dialect", "Dialect"], ["tribe", "Tribe"] ] as const).map(([field, label]) => (
      <div className="space-y-2" key={field}>
        <Label htmlFor={`${id}-${field}`}>{label}</Label>
        <div className="relative">
          <select id={`${id}-${field}`} value={values[field] ?? ""}
            className="flex h-10 w-full appearance-none rounded-md border border-input bg-background pl-3 pr-9 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={event => onChange(field, event.target.value)}>
            <option value="">{search ? `All ${field === "dialect" ? "dialects" : "tribes"}` : `Select ${label.toLowerCase()} (optional)`}</option>
            {cultureOptions(dataset.entries, field, values[field]).map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-3 h-4 w-4 opacity-50" />
        </div>
      </div>
    ))}
    </div>
    <p className="text-xs text-muted-foreground">Source: <a className="underline" href={dataset.source} target="_blank" rel="noreferrer">PSA census language/dialect and ethnicity codes (2010)</a>. Tribe includes ethnic groups.</p>
  </div>;
}
